"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendProfileUpdatedEmail } from "@/lib/mail";

const FIELD_LABELS: Record<string, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    age: "Age",
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
    const supabase = await createClient();

    await supabase
        .from("jury_participants")
        .update({ approved_by_admin: true })
        .eq("user_id", userId);

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
