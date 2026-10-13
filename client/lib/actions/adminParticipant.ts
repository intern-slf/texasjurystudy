"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendProfileUpdatedEmail, sendReactivationEmail } from "@/lib/mail";
import { generateReactivationToken } from "@/lib/reactivationToken";
import { dateOfBirthError } from "@/lib/age-gate";
import { requireAdmin } from "@/lib/requireAdmin";
import { markBlacklisted } from "@/lib/participant/blacklist";

// Every export here is an admin action, and starts with requireAdmin(): as server
// actions they can be called by anyone signed in, with any participant's id.

// The fields the admin edit form changes, named for the profile-updated email. Also
// the columns adminUpdateParticipant may write (with "country"), so a field added to
// EditProfileForm goes here too, or an admin's change to it is dropped.
const FIELD_LABELS: Record<string, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    gender: "Gender",
    race: "Race",
    phone: "Phone Number",
    street_address: "Street Address",
    address_line_2: "Address Line 2",
    city: "City",
    county: "County",
    state: "State",
    zip_code: "ZIP Code",
    availability_weekdays: "Weekday Availability",
    availability_weekends: "Weekend Availability",
    interested_in_offline: "Interest in In-Person Focus Groups",
    served_on_jury: "Served on Jury",
    convicted_felon: "Convicted Felon Status",
    us_citizen: "U.S. Citizenship",
    has_children: "Has Children",
    served_armed_forces: "Armed Forces Service",
    currently_employed: "Employment Status",
    industry: "Industry / Field",
    marital_status: "Marital Status",
    political_affiliation: "Political Affiliation",
    education_level: "Education Level",
    family_income: "Family Income",
    heard_about_us: "Referral Source",
    driver_license_number: "Driver's License Number",
    driver_license_image_url: "ID Photo",
    paypal_username: "PayPal Username",
};

// What adminUpdateParticipant writes. The rest of the row (approval, the blacklist,
// strikes, the cooldown, reactivation, email, user_id) has its own action or isn't
// an admin's to set here, and the service role would write it unchecked.
const EDITABLE_FIELDS = new Set([...Object.keys(FIELD_LABELS), "country"]);

/** A file directly inside this participant's own "<userId>/" folder in id-documents. */
function isOwnIdPhotoPath(userId: string, path: unknown): boolean {
    if (typeof path !== "string") return false;
    // Lower-cased: the form builds the folder from the stored user_id, and the id in
    // the page's URL may differ in case.
    const folder = `${userId.toLowerCase()}/`;
    if (!path.toLowerCase().startsWith(folder)) return false;
    const name = path.slice(folder.length);
    return name.length > 0 && !name.includes("/") && name !== "." && name !== "..";
}

/* =========================
   VERIFY (APPROVE) PARTICIPANT
========================= */

export async function verifyParticipant(userId: string) {
    await requireAdmin();

    // Use supabaseAdmin (service role): there is no admin UPDATE RLS policy on
    // jury_participants, so the RLS-bound client silently updates 0 rows.
    // Matches blacklistParticipant / unblacklistParticipant.
    const { error } = await supabaseAdmin
        .from("jury_participants")
        .update({ approved_by_admin: true })
        .eq("user_id", userId);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/Admin/participants");
}

/* =========================
   BLACKLIST PARTICIPANT
========================= */

export async function blacklistParticipant(userId: string, reason: string) {
    await requireAdmin();

    // Participants only, as in autoBlacklistIfIneligible: markBlacklisted overwrites
    // the roles row, so an admin's id (the caller's own included) or a firm's would
    // lose its access.
    const { data: target, error: targetError } = await supabaseAdmin
        .from("roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (target?.role === "admin" || target?.role === "requestee") {
        throw new Error("Only participants can be blacklisted.");
    }

    await markBlacklisted(userId, reason);
    revalidatePath("/dashboard/Admin/participants");
}

/* =========================
   UNBLACKLIST (VERIFY) PARTICIPANT
========================= */

export async function unblacklistParticipant(userId: string) {
    await requireAdmin();

    // 1. Restore role → 'participant'
    await supabaseAdmin
        .from("roles")
        .update({ role: "participant" })
        .eq("user_id", userId);

    // 2. Clear blacklist fields — send back to new requests (not auto-approved).
    //    Also reset flag_count so a reinstated participant starts fresh (otherwise
    //    the next single back-out would immediately re-blacklist them).
    await supabaseAdmin
        .from("jury_participants")
        .update({
            blacklist_reason: null,
            blacklisted_at: null,
            approved_by_admin: false,
            flag_count: 0,
        })
        .eq("user_id", userId);

    // 3. Clear the per-session strikes that produced that count. Without this the
    //    counter reads 0 while their sessions still render "Striked", and the two
    //    disagree permanently.
    const { error: strikeClearErr } = await supabaseAdmin
        .from("session_participants")
        .update({ struck_at: null, struck_by: null })
        .eq("participant_id", userId)
        .not("struck_at", "is", null);

    if (strikeClearErr) {
        console.error(
            `[unblacklistParticipant] flag_count reset but per-session strikes remain for ${userId}: ${strikeClearErr.message}`
        );
    }

    console.log(`[unblacklistParticipant] Unblacklisted user ${userId} — moved back to requests.`);

    revalidatePath("/dashboard/Admin/participants");
    revalidatePath("/dashboard/Admin", "layout");
}

/* =========================
   ADMIN EDIT PARTICIPANT
========================= */

export async function adminUpdateParticipant(userId: string, payload: Record<string, unknown>) {
    await requireAdmin();

    // Only the fields the edit form owns. It also sends email (unchanged, from the
    // page-load snapshot) and date_updated (set below), which are dropped here.
    const updates = Object.fromEntries(
        Object.entries(payload).filter(([key]) => EDITABLE_FIELDS.has(key))
    );
    // The form only sends a photo it has just uploaded to this participant's folder.
    // Any other path would point their profile at someone else's ID.
    if ("driver_license_image_url" in updates && !isOwnIdPhotoPath(userId, updates.driver_license_image_url)) {
        throw new Error("The ID photo must be in this participant's folder.");
    }

    // Fetch current data before updating so we can diff
    const { data: current } = await supabaseAdmin
        .from("jury_participants")
        .select("*")
        .eq("user_id", userId)
        .single();

    const { error } = await supabaseAdmin
        .from("jury_participants")
        .update({ ...updates, date_updated: new Date().toISOString() })
        .eq("user_id", userId);

    if (error) throw new Error(error.message);

    revalidatePath(`/dashboard/participant/${userId}`);
    revalidatePath("/dashboard/Admin/participants");

    // Notify participant — only list fields whose values actually changed
    try {
        if (current?.email) {
            const changedFields = Object.keys(updates)
                .filter((k) => k in FIELD_LABELS && String(updates[k] ?? "") !== String(current[k] ?? ""))
                .map((k) => FIELD_LABELS[k]);

            if (changedFields.length > 0) {
                await sendProfileUpdatedEmail(current.email, current.first_name || "there", changedFields);
            }
        }
    } catch (emailErr) {
        console.error("[adminUpdateParticipant] Failed to send profile update email:", emailErr);
    }
}

export async function adminUpdateParticipantDob(userId: string, dateOfBirth: string) {
    await requireAdmin();

    const dobError = dateOfBirthError(dateOfBirth);
    if (dobError) throw new Error(dobError);

    const { error } = await supabaseAdmin
        .from("jury_participants")
        .update({ date_of_birth: dateOfBirth })
        .eq("user_id", userId);

    if (error) throw new Error(error.message);
}

/* =========================
   SEND REACTIVATION EMAILS
   "Are you still interested?" campaign — one-click magic-link confirmation.
========================= */

export type ReactivationResult = {
    sent: number;
    failed: number;
    skipped: number;
    errors: { userId: string; error: string }[];
};

// Don't re-email anyone we successfully emailed within this window. Long enough
// to absorb rapid double-submits and quick "some failed, let me retry" clicks;
// far shorter than the days/weeks between intentional re-send campaigns.
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

export async function sendReactivationEmails(userIds: string[]): Promise<ReactivationResult> {
    await requireAdmin();

    const result: ReactivationResult = { sent: 0, failed: 0, skipped: 0, errors: [] };

    const secret = process.env.EMAIL_ACTION_SECRET;
    if (!secret) {
        throw new Error("EMAIL_ACTION_SECRET is not configured on the server.");
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!appUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL is not configured on the server.");
    }

    // Cap to match the UI guardrail — prevents accidental fan-out.
    const ids = Array.from(new Set(userIds)).slice(0, 500);

    // Only target approved, non-blacklisted rows; defense-in-depth against
    // URL-tampered IDs reaching this action. Anyone at "no" (they answered "No,
    // please remove me" or unsubscribed) is out too; the NULL arm keeps a
    // status-less row eligible.
    const { data: rows, error } = await supabaseAdmin
        .from("jury_participants")
        .select("user_id, email, first_name, reactivation_email_sent_at")
        .in("user_id", ids)
        .eq("approved_by_admin", true)
        .is("blacklisted_at", null)
        .or("reactivation_status.is.null,reactivation_status.neq.no");

    if (error) {
        throw new Error(`Failed to load participants: ${error.message}`);
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const deadlineIso = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Idempotency guard: drop anyone already emailed within the cooldown. This
    // neutralises rapid double-submits, and makes retries safe — a failed send
    // never sets reactivation_email_sent_at, so a retry only re-targets the
    // rows that didn't go out, never the ones that already did.
    const targets = (rows ?? []).filter((row) => {
        const sentAtMs = row.reactivation_email_sent_at
            ? new Date(row.reactivation_email_sent_at).getTime()
            : 0;
        if (sentAtMs && nowMs - sentAtMs < RESEND_COOLDOWN_MS) {
            result.skipped++;
            return false;
        }
        return true;
    });

    // Fire the emails concurrently. sendEmail caps its own in-flight requests
    // (MAX_IN_FLIGHT in lib/mail.ts) and the mailer service paces the actual
    // Gmail API calls, so the excess queues rather than stampeding — far faster
    // than awaiting one round trip per recipient in series.
    const outcomes = await Promise.allSettled(
        targets.map(async (row) => {
            if (!row.email) {
                throw new Error("missing email");
            }

            const yesToken = generateReactivationToken(row.user_id, "yes", secret);
            const noToken = generateReactivationToken(row.user_id, "no", secret);
            const editToken = generateReactivationToken(row.user_id, "edit", secret);
            const unsubscribeToken = generateReactivationToken(row.user_id, "unsubscribe", secret);
            const yesUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(yesToken)}`;
            const noUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(noToken)}`;
            const profileEditUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(editToken)}`;
            const unsubscribeUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(unsubscribeToken)}`;

            await sendReactivationEmail({
                to: row.email,
                firstName: row.first_name,
                yesUrl,
                noUrl,
                profileEditUrl,
                unsubscribeUrl,
            });
        })
    );

    const sentUserIds: string[] = [];
    outcomes.forEach((outcome, i) => {
        const row = targets[i];
        if (outcome.status === "fulfilled") {
            sentUserIds.push(row.user_id);
        } else {
            result.failed++;
            const reason = outcome.reason;
            const message = reason instanceof Error ? reason.message : "unknown error";
            result.errors.push({ userId: row.user_id, error: message });
            // The admin-facing banner says "check the server logs" — this is that
            // log. SMTP rejections (Gmail 454-4.7.0 throttling, 550, daily cap)
            // only ever surface here, so keep the raw provider message.
            console.error(
                `[sendReactivationEmails] send failed for ${row.user_id} <${row.email ?? "no email"}>: ${message}`
            );
        }
    });

    // One bulk UPDATE for everyone that sent — the timestamps are identical, so
    // this replaces N per-row PATCHes with a single round-trip.
    if (sentUserIds.length > 0) {
        const { error: updateErr } = await supabaseAdmin
            .from("jury_participants")
            .update({
                reactivation_email_sent_at: nowIso,
                reactivation_deadline_at: deadlineIso,
            })
            .in("user_id", sentUserIds);

        if (updateErr) {
            // Emails went out but we couldn't record it — surface as failures
            // so the admin knows the campaign state is inconsistent.
            result.failed += sentUserIds.length;
            result.errors.push({ userId: "(bulk update)", error: updateErr.message });
            console.error(
                `[sendReactivationEmails] ${sentUserIds.length} email(s) SENT but reactivation_email_sent_at was not recorded: ${updateErr.message}. ` +
                `Affected user_ids: ${sentUserIds.join(",")}`
            );
        } else {
            result.sent += sentUserIds.length;
        }
    }

    // One summary line per run so the Vercel log explains any banner the admin
    // sees — including the all-skipped case, which is otherwise indistinguishable
    // from "nothing happened".
    console.log(
        `[sendReactivationEmails] requested=${ids.length} eligible=${rows?.length ?? 0} ` +
        `attempted=${targets.length} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`
    );

    revalidatePath("/dashboard/Admin/participants");
    return result;
}
