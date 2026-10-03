import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Blacklists a participant: their roles row becomes "blacklisted", and jury_participants
 * gets the reason and time and loses admin approval. The invite paths treat either
 * marker as blacklisted, but only roles is safe from the participant: they can write
 * every column of their own jury_participants row (F26 in docs/rls-policies.md).
 *
 * Deliberately not a server action (no "use server"), so it can't be called from the
 * browser. Its callers check who is asking: blacklistParticipant (admins),
 * recordBackoutStrike (through the admin-only flagParticipant) and
 * autoBlacklistIfIneligible (the participant, or an admin).
 */
export async function markBlacklisted(userId: string, reason: string): Promise<void> {
  // Upsert, not update: a login can be missing its roles row (557 were, until the
  // 2026-10-03 backfill), and an update would leave them marked only where they can
  // clear it themselves. A profile with no login can't have a roles row (23503), but
  // can't be invited either.
  const { error: roleError } = await supabaseAdmin
    .from("roles")
    .upsert({ user_id: userId, role: "blacklisted" }, { onConflict: "user_id" });

  // Written even if the roles write failed, so one marker still lands.
  const { error: participantError } = await supabaseAdmin
    .from("jury_participants")
    .update({
      blacklist_reason: reason,
      blacklisted_at: new Date().toISOString(),
      approved_by_admin: false,
    })
    .eq("user_id", userId);

  const failures = [
    roleError && roleError.code !== "23503" ? `roles upsert: ${roleError.message}` : null,
    participantError ? `jury_participants update: ${participantError.message}` : null,
  ].filter(Boolean);
  if (failures.length > 0) throw new Error(failures.join("; "));

  console.log(`[markBlacklisted] Blacklisted user ${userId}. Reason: ${reason}`);
}
