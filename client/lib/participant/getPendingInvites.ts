import { supabaseAdmin } from "@/lib/supabase/admin";
import { unstable_noStore as noStore } from "next/cache";

export async function getPendingInvites(userId: string) {
  noStore(); // ✅ HARD REFRESH — disables all caching

  const supabase = supabaseAdmin;

  // `cases.delivery_mode` says whether accepting means joining a Zoom call or
  // travelling to a venue. Every case in a session shares one value, so the
  // dashboards read it off the first. (PostgREST select strings take no
  // comments — keep notes out here.)
  const { data, error } = await supabase
    .from("session_participants")
    .select(`
      id,
      invite_status,
      session_id,
      sessions (
        session_date,
        session_cases (
          start_time,
          end_time,
          cases (
            title,
            delivery_mode
          )
        )
      )
    `)
    .eq("participant_id", userId)
    .eq("invite_status", "pending");

  if (error) throw error;

  // ✅ DEDUPLICATE: Only show one invite per session
  const uniqueSessions = new Set();
  const filteredData = (data || []).filter((invite: { session_id: string }) => {
    if (uniqueSessions.has(invite.session_id)) return false;
    uniqueSessions.add(invite.session_id);
    return true;
  });

  return filteredData;
}
