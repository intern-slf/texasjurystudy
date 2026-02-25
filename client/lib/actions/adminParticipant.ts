"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
