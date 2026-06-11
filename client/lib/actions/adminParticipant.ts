"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendProfileUpdatedEmail, sendReactivationEmail } from "@/lib/mail";
import { generateReactivationToken } from "@/lib/reactivationToken";

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

/* =========================
   VERIFY (APPROVE) PARTICIPANT
========================= */

export async function verifyParticipant(userId: string) {
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
    const blacklistedAt = new Date().toISOString();

    // 1. Update roles table → 'blacklisted'
    await supabaseAdmin
        .from("roles")
        .update({ role: "blacklisted" })
        .eq("user_id", userId);

    // 2. Record reason + timestamp on jury_participants
    await supabaseAdmin
        .from("jury_participants")
        .update({
            blacklist_reason: reason,
            blacklisted_at: blacklistedAt,
            approved_by_admin: false,
        })
        .eq("user_id", userId);

    console.log(`[blacklistParticipant] Blacklisted user ${userId}. Reason: ${reason}`);

    revalidatePath("/dashboard/Admin/participants");
}

/* =========================
   UNBLACKLIST (VERIFY) PARTICIPANT
========================= */

export async function unblacklistParticipant(userId: string) {
    // 1. Restore role → 'participant'
    await supabaseAdmin
        .from("roles")
        .update({ role: "participant" })
        .eq("user_id", userId);

    // 2. Clear blacklist fields — send back to new requests (not auto-approved)
    await supabaseAdmin
        .from("jury_participants")
        .update({
            blacklist_reason: null,
            blacklisted_at: null,
            approved_by_admin: false,
        })
        .eq("user_id", userId);

    console.log(`[unblacklistParticipant] Unblacklisted user ${userId} — moved back to requests.`);

    revalidatePath("/dashboard/Admin/participants");
}

/* =========================
   ADMIN EDIT PARTICIPANT
========================= */

export async function adminUpdateParticipant(userId: string, payload: Record<string, unknown>) {
    // Fetch current data before updating so we can diff
    const { data: current } = await supabaseAdmin
        .from("jury_participants")
        .select("*")
        .eq("user_id", userId)
        .single();

    const { error } = await supabaseAdmin
        .from("jury_participants")
        .update({ ...payload, date_updated: new Date().toISOString() })
        .eq("user_id", userId);

    if (error) throw new Error(error.message);

    revalidatePath(`/dashboard/participant/${userId}`);
    revalidatePath("/dashboard/Admin/participants");

    // Notify participant — only list fields whose values actually changed
    try {
        if (current?.email) {
            const changedFields = Object.keys(payload)
                .filter((k) => k in FIELD_LABELS && String(payload[k] ?? "") !== String(current[k] ?? ""))
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
    // URL-tampered IDs reaching this action.
    const { data: rows, error } = await supabaseAdmin
        .from("jury_participants")
        .select("user_id, email, first_name, reactivation_email_sent_at")
        .in("user_id", ids)
        .eq("approved_by_admin", true)
        .is("blacklisted_at", null);

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

    // Fire the emails concurrently. The SMTP transporter is pooled
    // (maxConnections), so this many sends run at once and the rest queue —
    // far faster than awaiting one handshake per recipient in series.
    const outcomes = await Promise.allSettled(
        targets.map(async (row) => {
            if (!row.email) {
                throw new Error("missing email");
            }

            const yesToken = generateReactivationToken(row.user_id, "yes", secret);
            const noToken = generateReactivationToken(row.user_id, "no", secret);
            const editToken = generateReactivationToken(row.user_id, "edit", secret);
            const yesUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(yesToken)}`;
            const noUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(noToken)}`;
            const profileEditUrl = `${appUrl}/api/email-action/reactivate?token=${encodeURIComponent(editToken)}`;

            await sendReactivationEmail({
                to: row.email,
                firstName: row.first_name,
                yesUrl,
                noUrl,
                profileEditUrl,
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
        } else {
            result.sent += sentUserIds.length;
        }
    }

    revalidatePath("/dashboard/Admin/participants");
    return result;
}
