import { createClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";

export async function getPendingInvites(userId: string) {
  noStore(); // ✅ HARD REFRESH — disables all caching

  const supabase = await createClient();

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
