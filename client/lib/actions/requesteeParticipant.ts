"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBlockedParticipantIds } from "@/lib/case-lineage";
import { ACTIVE_STATUS } from "@/lib/participant/activeStatus";
import { getAllIdsWithoutLogin } from "@/lib/participant/loginAccount";
import {
  ownsAllCases,
  participantNamesForCases,
  toRequesteeSearchResult,
  type RequesteeSearchResult,
} from "@/lib/participant/requesteeAccess";

/**
 * Names for the requestee's participant lists (CaseParticipantSummary and
 * RequesteeParticipantHistory). Requestee logins can't read participant tables
 * themselves, so these come from here: the caller must own every case, and only
 * names of people on those cases' sessions come back. Only admins attach a case
 * to a session, so a case row someone created for themselves has nobody on it.
 */
export async function getCaseParticipantNames(
  caseIds: string[],
  participantIds: string[]
): Promise<Record<string, { first_name: string | null; last_name: string | null }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const cases = Array.from(new Set(caseIds)).slice(0, 100);
  if (cases.length === 0 || participantIds.length === 0) return {};

  if (!(await ownsAllCases(user.id, cases))) {
    throw new Error("Case not found or not owned by you");
  }
  return participantNamesForCases(cases, participantIds.slice(0, 2000));
}

/**
 * Search eligible participants for a case on the requestee side.
 * Excludes: blacklisted, cooldown-active, already invited to the case's session,
 * and participants blocked by the follow-up chain (linked list lineage).
 */
export async function searchParticipantsForCase(
  caseId: string,
  query: string
): Promise<RequesteeSearchResult[]> {
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

  // 3. Get the case's session, and refuse a case without one. Owning a case is
  //    no proof the caller is a firm: the cases INSERT policies only check
  //    auth.uid() = user_id, so anyone can create a case row of their own, and
  //    the search below reads the whole panel with the service role. Only admins
  //    attach a case to a session (session_cases is admin-write), and the Add
  //    participant button is disabled until there is one. Not a check on roles:
  //    that table doesn't have a row for every user.
  const { data: sessionCaseRow } = await supabase
    .from("session_cases")
    .select("session_id")
    .eq("case_id", caseId)
    .limit(1)
    .maybeSingle();

  const sessionId = sessionCaseRow?.session_id;
  if (!sessionId) throw new Error("No session assigned to this case yet");

  // 4. Get already-invited participant IDs for this session
  const { data: sessionParts } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId);
  const alreadyInvitedIds: string[] = (sessionParts ?? []).map((p) => p.participant_id);

  // 5. Get blacklisted user IDs. From here on the participant data is read with
  //    the service-role client: requestee logins can't read roles of other
  //    users or any participant table (see lib/participant/requesteeAccess), and
  //    only the fields in toRequesteeSearchResult go back to the browser.
  const { data: blacklistedRoles } = await supabaseAdmin
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: { user_id: string }) => r.user_id);

  // 5b. Participants with no login account — the invite insert would fail on
  //     session_participants' FK onto auth.users, so they are never offered.
  //     See lib/participant/loginAccount.
  const noLoginIds = Array.from(await getAllIdsWithoutLogin());

  // 6. Combine all exclusion IDs
  const excludeIds = Array.from(
    new Set([...blockedIds, ...alreadyInvitedIds, ...blacklistedIds, ...noLoginIds])
  );

  // 7. Determine table
  const { count } = await supabaseAdmin
    .from("jury_participants")
    .select("*", { count: "exact", head: true });
  const testTable = count === 0 || count === null ? "oldData" : "jury_participants";
  const isOldData = testTable === "oldData";

  const nowIso = new Date().toISOString();

  let q = supabaseAdmin.from(testTable).select("*");

  if (!isOldData) {
    q = q
      .or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`)
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null)
      // Only active panel members may attend — enforced in inviteParticipants.
      .eq("reactivation_status", ACTIVE_STATUS);
  }

  if (excludeIds.length > 0) {
    const idField = isOldData ? "id" : "user_id";
    q = q.not(idField, "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
  }

  // Letters, digits, spaces, hyphens, apostrophes and periods only: the term is
  // spliced into a PostgREST filter, where a comma or bracket would add filters.
  const term = query.trim().toLowerCase().replace(/[^\p{L}\p{N} .'-]/gu, "");
  if (term) {
    q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }

  const { data, error } = await q.limit(50);
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map(toRequesteeSearchResult);
}

/**
 * Requestee adds participants to their case's session.
 * Only works if the case already has a session assigned.
 */
export async function requesteeAddParticipants(
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

  const result = await inviteParticipants(sessionId, safeIds, session?.session_date ?? undefined);

  // Report what actually happened. Returning safeIds.length unconditionally told
  // the requestee "N added" even when every one of them had been dropped by the
  // invite guards — blacklisted, not an active panel member, or no login account.
  if (result.invited === 0) {
    throw new Error(result.error ?? "No participants could be added.");
  }

  return { invited: result.invited, warning: result.ok ? undefined : result.error };
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
