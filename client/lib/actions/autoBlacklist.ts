"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { markBlacklisted } from "@/lib/participant/blacklist";

/**
 * Called after a participant's profile is saved: blacklists them if their saved answers
 * say they're a convicted felon or not a US citizen.
 *
 * It only ever adds a blacklist. It used to lift one too, whenever the answers it was
 * handed looked eligible, and as a server action anyone signed in could call it for
 * anyone: so anyone could blacklist anyone, and a blacklisted participant could clear
 * their own blacklist, whoever had set it. Now the caller must be the participant or an
 * admin, the answers come from the database, and lifting a blacklist is an admin's call
 * (unblacklistParticipant). Nothing on the participant's row could decide it safely
 * anyway: participants can write every column of their own jury_participants row,
 * blacklist_reason included (docs/rls-policies.md).
 *
 * Admins and requestees are never touched. Never throws, because both forms await it
 * after the save has already succeeded.
 */
export async function autoBlacklistIfIneligible(userId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !userId) return;

    if (user.id !== userId) {
      const { data: callerRow, error: callerError } = await supabaseAdmin
        .from("roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (callerError) throw new Error(`caller roles lookup: ${callerError.message}`);
      if (callerRow?.role !== "admin") {
        console.warn(`[autoBlacklistIfIneligible] Refused: ${user.id} is not ${userId} or an admin.`);
        return;
      }
    }

    const [{ data: participant, error: participantError }, { data: roleRow, error: roleError }] =
      await Promise.all([
        supabaseAdmin
          .from("jury_participants")
          .select("convicted_felon, us_citizen, blacklisted_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin.from("roles").select("role").eq("user_id", userId).maybeSingle(),
      ]);
    if (participantError) throw new Error(`jury_participants lookup: ${participantError.message}`);
    if (roleError) throw new Error(`roles lookup: ${roleError.message}`);
    if (!participant || roleRow?.role === "admin" || roleRow?.role === "requestee") return;

    // Already blacklisted, by anyone: keep that blacklist and its reason. A legacy
    // participant has no roles row, so for them only jury_participants says so.
    const alreadyBlacklisted = roleRow ? roleRow.role === "blacklisted" : participant.blacklisted_at != null;
    if (alreadyBlacklisted) return;

    const reasons: string[] = [];
    if (participant.convicted_felon === "Yes") reasons.push("Convicted felon");
    if (participant.us_citizen === "No") reasons.push("Not a US citizen");
    if (reasons.length === 0) return;

    await markBlacklisted(userId, reasons.join(", "));
  } catch (err) {
    console.error(
      `[autoBlacklistIfIneligible] Failed for ${userId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
