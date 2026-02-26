import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  combineCaseFilters,
  applyCaseFilters,
  relaxFilters,
  FILTER_PRIORITY,
  FILTER_LABELS,
  CaseFilters,
  checkFilterMatch,
  attachMultiCaseScores,
  sortParticipantsByMultiCaseMatch,
} from "@/lib/filter-utils";
import { getAncestorCaseIds, getLineageParticipantIds } from "@/lib/case-lineage";
import InviteMoreModal, { type Candidate } from "@/components/InviteMoreModal";
import RescheduleModal from "@/components/RescheduleModal";
import ReplaceCaseModal, { type ReplacementCandidate } from "@/components/ReplaceCaseModal";


async function submitSession(formData: FormData) {
  "use server";

  const sessionId = formData.get("sessionId") as string;
  const supabase = await createClient();

  // get all case ids in session
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const ids = sessionCases?.map((c) => c.case_id) ?? [];

  if (ids.length) {
    await supabase
      .from("cases")
      .update({ admin_status: "submitted" })
      .in("id", ids);
  }

  revalidatePath("/dashboard/Admin");
  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   HELPER: fetch recommended candidates for a session
   Excludes already-invited participant IDs.
========================= */
async function fetchCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseIds: string[],
  alreadyInvitedIds: Set<string>
): Promise<Candidate[]> {
  if (!caseIds.length) return [];

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, filters")
    .in("id", caseIds);

  const filtersList = (cases ?? []).map((c: any) => c.filters as CaseFilters);
  const combinedFilters = combineCaseFilters(filtersList);

  if (combinedFilters.ageRanges && cases) {
    combinedFilters.ageRanges = combinedFilters.ageRanges.map((r) => ({
      ...r,
      caseLabel:
        r.caseIndex !== undefined && cases[r.caseIndex]
          ? cases[r.caseIndex].title
          : r.caseLabel,
    }));
  }
  if (combinedFilters._perCaseFilters && cases) {
    combinedFilters._perCaseFilters = combinedFilters._perCaseFilters.map((pc) => ({
      ...pc,
      caseTitle:
        pc.caseIndex !== undefined && cases[pc.caseIndex]
          ? cases[pc.caseIndex].title
          : pc.caseTitle,
    }));
  }

  // Determine table
  const { count } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true });
  const testTable = count === 0 || count === null ? "oldData" : "jury_participants";
  const isOldData = testTable === "oldData";

  // Blacklisted IDs
  const { data: blacklistedRoles } = await supabase
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: any) => r.user_id as string);

  // Lineage exclusions
  const allLineageIds: string[] = [];
  if (caseIds.length > 0) {
    const ancestorBatch = await Promise.all(caseIds.map((id) => getAncestorCaseIds(id)));
    const uniqueAncestorIds = Array.from(new Set(ancestorBatch.flat()));
    const lineageIds = await getLineageParticipantIds(uniqueAncestorIds);
    allLineageIds.push(...lineageIds);
  }

  const nowIso = new Date().toISOString();
  const seenIds = new Set<string>(alreadyInvitedIds);
  let rawParticipants: any[] = [];
  const minRequired = 50;

  for (let level = 0; level <= FILTER_PRIORITY.length; level++) {
    if (rawParticipants.length >= minRequired) break;

    const currentFilters = relaxFilters(combinedFilters, level);
    let query = supabase.from(testTable).select("*");
    query = applyCaseFilters(query, currentFilters);

    if (!isOldData) {
      const exclusions = Array.from(new Set([...blacklistedIds, ...allLineageIds]));
      if (exclusions.length > 0) {
        // @ts-ignore
        query = query.not("user_id", "in", `(${exclusions.map((id) => `"${id}"`).join(",")})`);
      }
      query = query.or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`);
      query = query.eq("approved_by_admin", true).is("blacklisted_at", null);
    }

    if (seenIds.size > 0) {
      const idField = isOldData ? "id" : "user_id";
      // @ts-ignore
      query = query.not(idField, "in", `(${Array.from(seenIds).map((id) => `"${id}"`).join(",")})`);
    }

    // @ts-ignore
    const { data: batch } = await query.limit(minRequired - rawParticipants.length + 20);

    if (batch && batch.length > 0) {
      const shuffled = batch.sort(() => Math.random() - 0.5);
      for (const p of shuffled) {
        const pId = p.user_id || p.id;
        if (seenIds.has(pId)) continue;
        seenIds.add(pId);
        p.matchLevel = level;
        p.filterChecks = FILTER_PRIORITY.map((key) => ({
          key,
          label: FILTER_LABELS[key] || key,
          ...checkFilterMatch(p, combinedFilters, key),
        }));
        const allFiltersPassed = p.filterChecks.every((fc: any) => fc.passes);
        if (!allFiltersPassed && p.matchLevel === 0) p.matchLevel = 1;
        rawParticipants.push(p);
      }
    }
  }

  rawParticipants = attachMultiCaseScores(rawParticipants, filtersList);
  rawParticipants = sortParticipantsByMultiCaseMatch(rawParticipants);

  return rawParticipants.map((p): Candidate => ({
    id: p.user_id || p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    age: p.age,
    city: p.city,
    political_affiliation: p.political_affiliation,
    matchLevel: p.matchLevel,
    filterChecks: p.filterChecks,
  }));
}


export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const showSuccess = params?.created === "1";

  /* =========================
     FETCH SESSIONS
  ========================= */

  // Fetch all case IDs already in any session
  const { data: allSessionCaseRows } = await supabase
    .from("session_cases")
    .select("case_id");
  const scheduledCaseIds = new Set((allSessionCaseRows ?? []).map((r) => r.case_id));

  // Fetch approved cases not yet in any session (replacement candidates)
  const { data: rawCandidates } = await supabase
    .from("cases")
    .select("id, title")
    .eq("admin_status", "approved");
  const replacementCandidates: ReplacementCandidate[] = (rawCandidates ?? []).filter(
    (c) => !scheduledCaseIds.has(c.id)
  );

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, created_by")
    .order("session_date", { ascending: false });

  /* =========================
     ENRICH SESSIONS
  ========================= */

  const enrichedSessions = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const { data: scases } = await supabase
        .from("session_cases")
        .select("case_id, start_time, end_time")
        .eq("session_id", s.id);

      const caseIds = scases?.map((c) => c.case_id) ?? [];

      const { data: caseDetails } = caseIds.length
        ? await supabase
          .from("cases")
          .select("id, title, admin_status, schedule_status")
          .in("id", caseIds)
        : { data: [] };

      const alreadySubmitted = Boolean(
        caseDetails?.length &&
        caseDetails.every((c) => c.admin_status === "submitted")
      );

      const { data: sParticipants } = await supabase
        .from("session_participants")
        .select("participant_id, invite_status")
        .eq("session_id", s.id);

      const participantIds = sParticipants?.map((p) => p.participant_id) ?? [];

      let participantDetails: any[] = [];
      if (participantIds.length) {
        const { data: jData } = await supabase
          .from("jury_participants")
          .select("user_id, first_name, last_name")
          .in("user_id", participantIds);

        participantDetails = jData ?? [];

        const foundIds = new Set(participantDetails.map(p => p.user_id));
        const missingIds = participantIds.filter(id => !foundIds.has(id));

        if (missingIds.length > 0) {
          const { data: oData } = await supabase
            .from("oldData")
            .select("id, first_name, last_name")
            .in("id", missingIds);

          if (oData) {
            participantDetails.push(...oData.map(od => ({
              user_id: od.id,
              first_name: od.first_name,
              last_name: od.last_name
            })));
          }
        }
      }

      // Fetch recommended candidates (excluding already-invited)
      const alreadyInvitedSet = new Set(participantIds);
      const candidates = await fetchCandidates(supabase, caseIds, alreadyInvitedSet);

      return { s, scases, caseDetails, alreadySubmitted, sParticipants, participantDetails, candidates };
    })
  );

  // Sort: unnotified sessions first
  enrichedSessions.sort((a, b) => Number(a.alreadySubmitted) - Number(b.alreadySubmitted));

  return (
    <div className="space-y-8">
      {/* ====== SUCCESS BANNER ====== */}
      {showSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <span className="text-xl">✅</span>
          <div>
            <p className="font-semibold text-sm">Session created successfully!</p>
            <p className="text-xs text-green-600 mt-0.5">Invitations have been sent to all selected participants.</p>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>

        <Link href="/dashboard/Admin" className="text-sm underline">
          ← Back to Cases
        </Link>
      </div>

      {/* LIST */}
      {enrichedSessions.length ? (
        enrichedSessions.map(({ s, scases, caseDetails, alreadySubmitted, sParticipants, participantDetails, candidates }) => (
          <div
            key={s.id}
            className="border rounded p-6 space-y-6 bg-white shadow-sm"
          >
                {/* SESSION INFO */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-semibold">
                      {s.session_date}
                    </div>
                    <div className="text-xs text-slate-500">
                      Session ID: {s.id}
                    </div>
                  </div>
                  <RescheduleModal
                    sessionId={s.id}
                    sessionDate={s.session_date}
                    cases={(scases ?? []).map((sc) => ({
                      case_id: sc.case_id,
                      title: caseDetails?.find((cd) => cd.id === sc.case_id)?.title ?? "Unknown",
                      start_time: sc.start_time,
                      end_time: sc.end_time,
                    }))}
                  />
                </div>

                {/* CASES */}
                <div>
                  <h2 className="font-medium mb-2">Cases</h2>

                  <div className="space-y-2">
                    {scases?.length ? (
                      scases.map((c, i) => {
                        const detail = caseDetails?.find(
                          (x) => x.id === c.case_id
                        );

                        return (
                          <div
                            key={i}
                            className="text-sm flex justify-between border rounded px-3 py-2 items-center"
                          >
                            <span>{detail?.title ?? "Unknown case"}</span>
                            <div className="flex items-center gap-2">
                              {detail?.schedule_status && (
                                <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${
                                  detail.schedule_status === "accepted"
                                    ? "bg-green-100 text-green-700"
                                    : detail.schedule_status === "rejected"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}>
                                  Presenter: {detail.schedule_status}
                                </span>
                              )}
                              {detail && detail.schedule_status !== "accepted" && (
                                <ReplaceCaseModal
                                  sessionId={s.id}
                                  oldCaseId={c.case_id}
                                  oldCaseTitle={detail?.title ?? "Unknown"}
                                  startTime={c.start_time}
                                  endTime={c.end_time}
                                  sessionDate={s.session_date}
                                  candidates={replacementCandidates}
                                />
                              )}
                              <span className="text-slate-500">
                                {c.start_time} → {c.end_time}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        No cases assigned.
                      </div>
                    )}
                  </div>
                </div>

                {/* PARTICIPANTS */}
                <div>
                  <h2 className="font-medium mb-2">Participants</h2>

                  <div className="space-y-2">
                    {sParticipants?.length ? (
                      sParticipants.map((p, i) => {
                        const detail = participantDetails?.find(
                          (x) => x.user_id === p.participant_id
                        );

                        return (
                          <div
                            key={i}
                            className="text-sm flex justify-between border rounded px-3 py-2"
                          >
                            <span>
                              {detail?.first_name} {detail?.last_name}
                            </span>

                            <span className="capitalize text-xs font-semibold">
                              {p.invite_status}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        No participants invited.
                      </div>
                    )}
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="flex justify-end gap-3">
                  {!alreadySubmitted && (
                    <InviteMoreModal
                      sessionId={s.id}
                      sessionDate={s.session_date}
                      candidates={candidates}
                    />
                  )}

                  <form action={submitSession}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button
                      disabled={alreadySubmitted}
                      className={`px-4 py-2 rounded text-sm text-white ${alreadySubmitted
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                        }`}
                    >
                      {alreadySubmitted ? "Already Notified" : "Notify Presenter"}
                    </button>
                  </form>
                </div>

              </div>
        ))
      ) : (
        <div className="text-slate-400 italic">
          No sessions created yet.
        </div>
      )}
    </div>
  );
}
