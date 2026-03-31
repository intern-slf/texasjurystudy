"use server";

import { createClient } from "@/lib/supabase/server";
import { getBlockedParticipantIds } from "@/lib/case-lineage";

/**
 * Search eligible participants for a case on the presenter side.
 * Excludes: blacklisted, cooldown-active, already invited to the case's session,
 * and participants blocked by the follow-up chain (linked list lineage).
 */
export async function searchParticipantsForCase(
  caseId: string,
  query: string
) {
  const supabase = await createClient();

  // 1. Verify the current user is the case owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id")
    .eq("id", caseId)
    .eq("user_id", user.id)
    .single();

  if (!caseRow) throw new Error("Case not found or not owned by you");

  // 2. Get blocked participant IDs from the follow-up chain
  const blockedIds = await getBlockedParticipantIds(caseId);

  // 3. Get session ID for this case (if any)
  const { data: sessionCaseRow } = await supabase
    .from("session_cases")
    .select("session_id")
    .eq("case_id", caseId)
    .limit(1)
    .maybeSingle();

  const sessionId = sessionCaseRow?.session_id;

  // 4. Get already-invited participant IDs for this session
  let alreadyInvitedIds: string[] = [];
  if (sessionId) {
    const { data: sessionParts } = await supabase
      .from("session_participants")
      .select("participant_id")
      .eq("session_id", sessionId);
    alreadyInvitedIds = (sessionParts ?? []).map((p) => p.participant_id);
  }

  // 5. Get blacklisted user IDs
  const { data: blacklistedRoles } = await supabase
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: any) => r.user_id as string);

  // 6. Combine all exclusion IDs
  const excludeIds = Array.from(
    new Set([...blockedIds, ...alreadyInvitedIds, ...blacklistedIds])
  );

  // 7. Determine table
  const { count } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true });
  const testTable = count === 0 || count === null ? "oldData" : "jury_participants";
  const isOldData = testTable === "oldData";

  const nowIso = new Date().toISOString();

  let q = supabase.from(testTable).select("*");

  if (!isOldData) {
    q = q
      .or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`)
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null);
  }

  if (excludeIds.length > 0) {
    const idField = isOldData ? "id" : "user_id";
    // @ts-ignore
    q = q.not(idField, "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
  }

  if (query.trim()) {
    const term = query.trim().toLowerCase();
    q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }

  // @ts-ignore
  const { data, error } = await q.limit(50);
  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.user_id || p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    city: p.city,
    date_of_birth: p.date_of_birth,
    political_affiliation: p.political_affiliation,
  }));
}

/**
 * Presenter adds participants to their case's session.
 * Only works if the case already has a session assigned.
 */
export async function presenterAddParticipants(
  caseId: string,
  participantIds: string[]
) {
  const supabase = await createClient();

  // 1. Verify ownership
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, user_id")
    .eq("id", caseId)
    .eq("user_id", user.id)
    .single();

  if (!caseRow) throw new Error("Case not found or not owned by you");

  // 2. Get session for this case
  const { data: sessionCaseRow } = await supabase
    .from("session_cases")
    .select("session_id")
    .eq("case_id", caseId)
    .limit(1)
    .maybeSingle();

  if (!sessionCaseRow?.session_id) {
    throw new Error("No session assigned to this case yet");
  }

  const sessionId = sessionCaseRow.session_id;

  // 3. Verify none of these participants are blocked by lineage
  const blockedIds = await getBlockedParticipantIds(caseId);
  const blockedSet = new Set(blockedIds);
  const safeIds = participantIds.filter((id) => !blockedSet.has(id));

  if (safeIds.length === 0) {
    throw new Error("All selected participants are blocked from this case's follow-up chain");
  }

  // 4. Insert into session_participants (delegate to inviteParticipants action)
  const { inviteParticipants } = await import("@/lib/actions/session");

  // Get session date for the email
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("id", sessionId)
    .single();

  await inviteParticipants(sessionId, safeIds, session?.session_date ?? undefined);

  return { invited: safeIds.length };
}

/**
 * Get session info for a case (used to check if "Add Participant" is available).
 */
export async function getCaseSessionInfo(caseId: string) {
  const supabase = await createClient();

  const { data: sessionCaseRow } = await supabase
    .from("session_cases")
    .select("session_id")
    .eq("case_id", caseId)
    .limit(1)
    .maybeSingle();

  if (!sessionCaseRow?.session_id) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date")
    .eq("id", sessionCaseRow.session_id)
    .single();

  // Get current participant count
  const { count } = await supabase
    .from("session_participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionCaseRow.session_id);

  return session
    ? { sessionId: session.id, sessionDate: session.session_date, participantCount: count ?? 0 }
    : null;
}
