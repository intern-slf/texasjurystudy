"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  const supabase = await createClient();

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

  // ✅ HARD REFRESH (server-side)
  revalidatePath("/dashboard/participant");
}
