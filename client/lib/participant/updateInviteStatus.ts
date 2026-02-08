"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  const supabase = await createClient(); // ✅ FIX

  const { error } = await supabase
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("id", sessionParticipantId);

  if (error) {
    throw new Error(error.message);
  }
}
