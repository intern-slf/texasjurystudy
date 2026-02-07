"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* =========================
   CREATE SESSION
========================= */
export async function createSession(sessionDate: string) {
  const supabase = await createClient();
  // who is creating
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      session_date: sessionDate,
      created_by: user.id,   // ✅ THE FIX
    })
    .select()
    .single();

  if (error) throw error;

  return data.id;
}

/* =========================
   ATTACH CASES
========================= */
export async function addCasesToSession(
  sessionId: string,
  cases: { caseId: string; start: string; end: string }[]
) {
  const supabase = await createClient();

  const rows = cases.map((c) => ({
    session_id: sessionId,
    case_id: c.caseId,
    start_time: c.start,
    end_time: c.end,
  }));

  const { error } = await supabase.from("session_cases").insert(rows);
  if (error) throw error;
}

/* =========================
   INVITE PARTICIPANTS
========================= */
export async function inviteParticipants(
  sessionId: string,
  participantIds: string[]
) {
  const supabase = await createClient();

  const rows = participantIds.map((id) => ({
    session_id: sessionId,
    participant_id: id,
  }));

  const { error } = await supabase
    .from("session_participants")
    .insert(rows);

  if (error) throw error;

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   PARTICIPANT RESPONSE
========================= */
export async function respondToInvite(
  sessionId: string,
  participantId: string,
  status: "accepted" | "rejected"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);

  if (error) throw error;
}
