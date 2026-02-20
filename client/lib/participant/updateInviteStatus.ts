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
  if (status === "accepted" && updatedRows && updatedRows.length > 0) {
    const { session_id, participant_id } = updatedRows[0];

    try {
      // Fetch session date
      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("session_date")
        .eq("id", session_id)
        .single();

      // Fetch all case end times for this session
      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("end_time")
        .eq("session_id", session_id);

      if (session && sessionCases && sessionCases.length > 0) {
        // Find the latest end_time (stored as HH:MM or HH:MM:SS)
        const latestEndTime = sessionCases
          .map((sc) => sc.end_time as string)
          .sort()
          .at(-1)!;

        // Build full datetime: session_date + latestEndTime + 24h
        const sessionDateStr = (session.session_date as string).split("T")[0];
        const combinedDatetime = new Date(`${sessionDateStr}T${latestEndTime}`);
        combinedDatetime.setHours(combinedDatetime.getHours() + 24);
        const eligibleAfterAt = combinedDatetime.toISOString();

        // Update eligible_after_at on the participant
        const { error: updateErr } = await supabaseAdmin
          .from("jury_participants")
          .update({ eligible_after_at: eligibleAfterAt })
          .eq("user_id", participant_id);

        if (updateErr) {
          console.error(`[updateInviteStatus] Failed to set eligible_after_at:`, updateErr.message);
        } else {
          console.log(`[updateInviteStatus] Set eligible_after_at to ${eligibleAfterAt} for participant ${participant_id}`);
        }
      }
    } catch (err) {
      console.error(`[updateInviteStatus] Error computing cooldown:`, err);
      // Don't throw — invite status already updated
    }
  }
}
