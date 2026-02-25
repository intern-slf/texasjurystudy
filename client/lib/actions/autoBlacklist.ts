"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Called after a participant submits their profile.
 * Auto-blacklists if they are a convicted felon or non-US citizen.
 * Updates both the roles table (role = 'blacklisted') and
 * jury_participants (blacklist_reason + blacklisted_at).
 */
export async function autoBlacklistIfIneligible(
  userId: string,
  convictedFelon: string,
  usCitizen: string
) {
  const isFelon = convictedFelon === "Yes";
  const isNonCitizen = usCitizen === "No";

  if (isFelon || isNonCitizen) {
    // Build reason string
    const reasons: string[] = [];
    if (isFelon) reasons.push("Convicted felon");
    if (isNonCitizen) reasons.push("Not a US citizen");
    const blacklistReason = reasons.join(", ");
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
        blacklist_reason: blacklistReason,
        blacklisted_at: blacklistedAt,
        approved_by_admin: false,
      })
      .eq("user_id", userId);

    console.log(`[autoBlacklistIfIneligible] Auto-blacklisted user ${userId}. Reason: ${blacklistReason}`);
  } else {
    // Participant is eligible - ensure they aren't marked as blacklisted if they were before
    // (e.g. if they corrected a form error)
    
    // 1. Check current role
    const { data: roleData } = await supabaseAdmin
      .from("roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleData?.role === "blacklisted") {
      // Restore to participant
      await supabaseAdmin
        .from("roles")
        .update({ role: "participant" })
        .eq("user_id", userId);

      // Clear audit fields
      await supabaseAdmin
        .from("jury_participants")
        .update({
          blacklist_reason: null,
          blacklisted_at: null,
        })
        .eq("user_id", userId);
        
      console.log(`[autoBlacklistIfIneligible] Restored user ${userId} to participant role (now eligible).`);
    }
  }
}
