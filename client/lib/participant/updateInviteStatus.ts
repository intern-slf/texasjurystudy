"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  console.log(`[updateInviteStatus] Updating ${sessionParticipantId} to ${status}`);
  const { data, error } = await supabaseAdmin
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("id", sessionParticipantId)
    .select();

  if (error) {
    console.error(`[updateInviteStatus] Error:`, error.message);
    throw new Error(error.message);
  }

  console.log(`[updateInviteStatus] Success:`, data);
}
