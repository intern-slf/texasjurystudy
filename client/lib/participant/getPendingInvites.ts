import { createClient } from "@/lib/supabase/server";

export async function getPendingInvites(userId: string) {
  const supabase = await createClient(); // ✅ FIX

  const { data, error } = await supabase
    .from("session_participants")
    .select(`
      id,
      invite_status,
      session_id,
      sessions (
        session_date
      )
    `)
    .eq("participant_id", userId)
    .eq("invite_status", "pending");

  if (error) throw error;
  return data || [];
}
