"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  console.log(`[updateInviteStatus] Updating ${sessionParticipantId} to ${status}`);

  // 1. Update invite status in session_participants and get the row back
  const { data: updatedRows, error } = await supabaseAdmin
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("id", sessionParticipantId)
    .select("session_id, participant_id");

  if (error) {
    console.error(`[updateInviteStatus] Error:`, error.message);
    throw new Error(error.message);
  }

  console.log(`[updateInviteStatus] Success:`, updatedRows);

  // 2. Only set cooldown when participant ACCEPTS
  if (status === "accepted" && updatedRows?.length) {
    const { session_id, participant_id } = updatedRows[0];

    try {
      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("session_date")
        .eq("id", session_id)
        .single();

      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("end_time")
        .eq("session_id", session_id);

      if (!session || !sessionCases?.length) return;

      const latestEndTime = sessionCases
        .map((sc) => sc.end_time as string)
        .sort((a, b) => a.localeCompare(b))
        .at(-1)!;

      const sessionDateStr = (session.session_date as string).split("T")[0];

      // Treat session date + end time as local time (admin enters local time)
      const eligibleDate = new Date(`${sessionDateStr}T${latestEndTime}`);

      eligibleDate.setDate(eligibleDate.getDate() + 1);

      const eligibleAfterAt = eligibleDate.toISOString();

      console.log("Cooldown set to:", eligibleAfterAt);

      const { error: cooldownErr } = await supabaseAdmin
        .from("jury_participants")
        .update({ eligible_after_at: eligibleAfterAt })
        .eq("user_id", participant_id);

      if (cooldownErr) {
        console.error("Cooldown update failed:", cooldownErr.message);
      }
    } catch (err) {
      console.error("Cooldown computation error:", err);
    }
  }
}
