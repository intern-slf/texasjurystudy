import { createClient } from "@/lib/supabase/server";
import {
  createSession,
  addCasesToSession,
  inviteParticipants,
} from "@/lib/actions/session";
import {
  combineCaseFilters,
  applyCaseFilters,
  relaxFilters,
  FILTER_PRIORITY,
  CaseFilters,
  attachMultiCaseScores,
  sortParticipantsByMultiCaseMatch
} from "@/lib/filter-utils";
import Link from "next/link";

/* =========================
   FILTER LABEL MAP
========================= */
const FILTER_LABELS: Record<string, string> = {
  location: "Location",
  age: "Age",
  race: "Race",
  gender: "Gender",
  socioeconomic: "Socioeconomic",
  eligibility: "Eligibility",
  political_affiliation: "Political Affiliation",
};

/**
 * Check if a participant actually passes a specific filter.
 * Returns { passes: boolean, detail: string }
 */
function checkFilterMatch(
  participant: any,
  filters: CaseFilters | null,
  filterKey: string
): { passes: boolean; detail: string } {
  if (!filters) return { passes: true, detail: "No filter" };

  const filterVal = (filters as any)[filterKey];

  switch (filterKey) {
    case "political_affiliation": {
      const arr = filterVal as string[] | undefined;
      if (!arr || arr.length === 0) return { passes: true, detail: "Any" };
      const pVal = participant.political_affiliation ?? "";
      const match = arr.includes(pVal);
      return { passes: match, detail: `${arr.join(", ")} (participant: ${pVal || "N/A"})` };
    }

    case "gender": {
      const arr = filterVal as string[] | undefined;
      if (!arr || arr.length === 0) return { passes: true, detail: "Any" };
      const pVal = participant.gender ?? "";
      const match = arr.includes(pVal);
      return { passes: match, detail: `${arr.join(", ")} (participant: ${pVal || "N/A"})` };
    }

    case "race": {
      const arr = filterVal as string[] | undefined;
      if (!arr || arr.length === 0) return { passes: true, detail: "Any" };
      const pVal = participant.race ?? "";
      const match = arr.includes(pVal);
      return { passes: match, detail: `${arr.join(", ")} (participant: ${pVal || "N/A"})` };
    }

    case "age": {
      const ageFilter = filterVal as { min?: number; max?: number } | undefined;
      if (!ageFilter) return { passes: true, detail: "Any" };
      const pAge = participant.age;
      const minOk = ageFilter.min === undefined || pAge >= ageFilter.min;
      const maxOk = ageFilter.max === undefined || pAge <= ageFilter.max;
      return {
        passes: minOk && maxOk,
        detail: `${ageFilter.min ?? 0}-${ageFilter.max ?? "99+"} (participant: ${pAge})`,
      };
    }

    case "location": {
      const loc = filterVal as { state?: string[] } | undefined;
      if (!loc?.state || loc.state.length === 0) return { passes: true, detail: "Any" };
      const pState = participant.state ?? "";
      const match = loc.state.includes(pState);
      return { passes: match, detail: `${loc.state.join(", ")} (participant: ${pState || "N/A"})` };
    }

    case "socioeconomic": {
      const socio = filterVal as any;
      if (!socio) return { passes: true, detail: "Any" };
      const checks: string[] = [];
      let allPass = true;

      if (socio.education_level?.length) {
        const match = socio.education_level.includes(participant.education_level);
        if (!match) allPass = false;
        checks.push(`Education: ${socio.education_level.join(", ")} (${match ? "pass" : "fail"})`);
      }
      if (socio.marital_status?.length) {
        const match = socio.marital_status.includes(participant.marital_status);
        if (!match) allPass = false;
        checks.push(`Marital: ${socio.marital_status.join(", ")} (${match ? "pass" : "fail"})`);
      }
      if (socio.family_income?.length) {
        const match = socio.family_income.includes(participant.family_income);
        if (!match) allPass = false;
        checks.push(`Income: ${socio.family_income.join(", ")} (${match ? "pass" : "fail"})`);
      }

      return {
        passes: allPass,
        detail: checks.length > 0 ? checks.join("; ") : "Any",
      };
    }

    case "eligibility": {
      const elig = filterVal as any;
      if (!elig) return { passes: true, detail: "Any" };
      const fields = [
        "served_on_jury", "convicted_felon", "us_citizen",
        "has_children", "served_armed_forces", "currently_employed", "internet_access"
      ];
      const checks: string[] = [];
      let allPass = true;
      for (const f of fields) {
        const required = elig[f];
        if (!required || required === "Any") continue;
        const pVal = participant[f];
        const match = pVal === required;
        if (!match) allPass = false;
        checks.push(`${f}: needs ${required} (${match ? "pass" : "fail: " + (pVal ?? "N/A")})`);
      }
      return {
        passes: allPass,
        detail: checks.length > 0 ? checks.join("; ") : "Any",
      };
    }

    default:
      return { passes: true, detail: "Unknown filter" };
  }
}

/* =========================
   PAGE
========================= */

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ selectedCases?: string | string[] }>;
}) {
  const supabase = await createClient();

  /* =========================
     READ SELECTED IDS
  ========================= */
  const params = await searchParams;

  const selectedIds = params?.selectedCases
    ? Array.isArray(params.selectedCases)
      ? params.selectedCases
      : [params.selectedCases]
    : [];

  /* =========================
     FETCH ONLY SELECTED CASES
  ========================= */

  const { data: cases } = selectedIds.length
    ? await supabase
      .from("cases")
      .select("id, title, scheduled_at, schedule_status, filters")
      .in("id", selectedIds)
      .order("created_at", { ascending: false })
    : { data: [] };

  // Calculate combined filters
  const filtersList = (cases || []).map((c: any) => c.filters as CaseFilters);
  const combinedFilters = combineCaseFilters(filtersList);

  // DEBUG
  //console.log("[DEBUG] combinedFilters:", JSON.stringify(combinedFilters, null, 2));

  // Participants (Soft Filtered)
  let participants: any[] = [];
  const minRequired = 50;
  const seenIds = new Set<string>();

  for (let level = 0; level <= FILTER_PRIORITY.length; level++) {
    if (participants.length >= minRequired) break;

    const currentFilters = relaxFilters(combinedFilters, level);

    let query = supabase
      .from("jury_participants")
      .select("*"); // Fetch all columns so we can compare against filters

    query = applyCaseFilters(query, currentFilters);

    if (seenIds.size > 0) {
      // @ts-ignore
      query = query.not('user_id', 'in', `(${Array.from(seenIds).map(id => `"${id}"`).join(',')})`);
    }

    // @ts-ignore
    const { data: batch } = await query.limit(minRequired - participants.length + 20);

    if (batch && batch.length > 0) {
      let newPeeps = batch.filter((p: any) => !seenIds.has(p.user_id));
      newPeeps = newPeeps.sort(() => Math.random() - 0.5);

      newPeeps.forEach((p: any) => {
        seenIds.add(p.user_id);
        p.matchLevel = level;

        // Check each filter against participant's actual data
        p.filterChecks = FILTER_PRIORITY.map((key) => ({
          key,
          label: FILTER_LABELS[key] || key,
          ...checkFilterMatch(p, combinedFilters, key),
        }));

        participants.push(p);
      });
    }
  }

  participants = attachMultiCaseScores(participants, filtersList);
  participants = sortParticipantsByMultiCaseMatch(participants);

  /* =========================
     SERVER ACTION
  ========================= */

  async function handleCreate(formData: FormData) {
    "use server";

    const date = formData.get("session_date") as string;
    if (!date) throw new Error("Session date required");

    const sessionId = await createSession(date);

    const selectedCases = (cases ?? [])
      .map((c) => {
        const start = formData.get(`start_${c.id}`) as string;
        const end = formData.get(`end_${c.id}`) as string;
        if (!start || !end) return null;
        return { caseId: c.id, start, end };
      })
      .filter(Boolean) as { caseId: string; start: string; end: string }[];

    if (selectedCases.length) {
      await addCasesToSession(sessionId, selectedCases);
    }

    const selectedParticipants = formData.getAll("participants") as string[];
    if (selectedParticipants.length) {
      await inviteParticipants(sessionId, selectedParticipants);
    }
  }

  /* =========================
     Counts
  ========================= */
  const exactCount = participants.filter((p: any) => p.matchLevel === 0).length;
  const partialCount = participants.filter((p: any) => p.matchLevel > 0 && p.matchLevel < FILTER_PRIORITY.length).length;
  const fallbackCount = participants.filter((p: any) => p.matchLevel >= FILTER_PRIORITY.length).length;

  /* =========================
     UI
  ========================= */

  return (
    <form action={handleCreate} className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Create Session</h1>
        <Link href="/dashboard/Admin" className="text-sm underline">
          &larr; Back
        </Link>
      </div>

      {/* DEBUG */}
      {/* <details className="border border-yellow-300 bg-yellow-50 rounded p-3 text-xs">
        <summary className="font-bold text-yellow-800 cursor-pointer">Debug: Filter Info</summary>
        <pre className="mt-2 overflow-auto max-h-40">{JSON.stringify(combinedFilters, null, 2)}</pre>
        <p className="mt-1 font-semibold">Total participants: {participants.length}</p>
        <p>Level 0 (Exact): {exactCount}</p>
        <p>Level 1-6 (Partial): {partialCount}</p>
        <p>Level 7+ (Fallback): {fallbackCount}</p>
      </details> */}

      {/* DATE */}
      <div>
        <label className="block text-sm font-medium mb-2">Session Date</label>
        <input type="date" name="session_date" required className="border rounded px-3 py-2" />
      </div>

      {/* SPLIT */}
      <div className="grid grid-cols-2 gap-8">
        {/* LEFT - CASES */}
        <div className="space-y-4">
          <h2 className="font-semibold">Cases &amp; Timing</h2>

          {cases?.length ? (
            cases.map((c) => (
              <div key={c.id} className="border rounded p-4 flex items-center justify-between">
                <div className="font-medium">{c.title}</div>

                {c.scheduled_at ? (
                  <div className="text-xs space-y-1">
                    <div className="text-slate-600">
                      Proposed: {new Date(c.scheduled_at).toLocaleString()}
                    </div>
                    {(!c.schedule_status || c.schedule_status === "pending") && (
                      <span className="text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded font-semibold">
                        Waiting response
                      </span>
                    )}
                    {c.schedule_status === "accepted" && (
                      <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded font-semibold">
                        Accepted by presenter
                      </span>
                    )}
                    {c.schedule_status === "rejected" && (
                      <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded font-semibold">
                        Rejected by presenter
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">No time proposed yet</div>
                )}

                <div className="flex gap-2 items-center pt-2">
                  <input type="time" name={`start_${c.id}`} className="border rounded px-2 py-1" required />
                  <span>&rarr;</span>
                  <input type="time" name={`end_${c.id}`} className="border rounded px-2 py-1" required />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400 italic">No cases selected.</div>
          )}
        </div>

        {/* RIGHT - PARTICIPANTS */}
        <div className="space-y-4">
          <h2 className="font-semibold">Participants</h2>

          <div className="border rounded divide-y max-h-[500px] overflow-y-auto">
            {participants?.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center justify-between p-3 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={`/dashboard/participant/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {p.first_name} {p.last_name}
                  </a>
                  <div className="text-xs text-slate-500 mt-1">
                    Age {p.age} &bull; {p.city} &bull; {p.political_affiliation ?? "N/A"}
                  </div>

                  {/* ====== MATCH BADGE (clickable to expand) ====== */}
                  <div className="mt-1">
                    {p.matchLevel === 0 && (
                      <details className="inline-block">
                        <summary className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded border border-green-200 text-[10px] font-semibold cursor-pointer select-none list-none">
                          Exact Match
                        </summary>
                        <div className="mt-1 p-2 bg-green-50 border border-green-200 rounded text-[10px] space-y-0.5">
                          {(p.filterChecks as any[]).map((fc: any) => (
                            <div key={fc.key} className={`flex gap-1 ${fc.passes ? "" : "text-red-500"}`}>
                              <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                              <span className="font-semibold">{fc.label}:</span>
                              <span>{fc.detail}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {p.matchLevel > 0 && p.matchLevel < FILTER_PRIORITY.length && (
                      <details className="inline-block">
                        <summary className="bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-200 text-[10px] font-semibold cursor-pointer select-none list-none">
                          Partial Match
                        </summary>
                        <div className="mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] space-y-0.5">
                          {(p.filterChecks as any[]).map((fc: any) => (
                            <div key={fc.key} className={`flex gap-1 ${fc.passes ? "text-green-700" : "text-red-500"}`}>
                              <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                              <span className="font-semibold">{fc.label}:</span>
                              <span>{fc.detail}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    <div className="text-[10px] text-slate-500 mt-1">
                      Cases Passed: {p.casePassCount}
                      {p.casePassCount > 0 && (
                        <span className="ml-2 text-[10px] font-semibold text-green-700">
                          ⭐ Recommended Candidate
                        </span>
                      )}
                      &nbsp;|&nbsp; Score: {p.multiScore} / {p.multiTotal}
                    </div>

                    {p.matchLevel >= FILTER_PRIORITY.length && (
                      <details className="inline-block">
                        <summary className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-semibold cursor-pointer select-none list-none">
                          Fallback
                        </summary>
                        <div className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-[10px] space-y-0.5">
                          {(p.filterChecks as any[]).map((fc: any) => (
                            <div key={fc.key} className={`flex gap-1 ${fc.passes ? "text-green-700" : "text-red-500"}`}>
                              <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                              <span className="font-semibold">{fc.label}:</span>
                              <span>{fc.detail}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                <label className="cursor-pointer p-1">
                  <input
                    type="checkbox"
                    name="participants"
                    value={p.user_id}
                    className="h-4 w-4 ml-2 flex-shrink-0"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button type="submit" className="bg-black text-white px-4 py-2 rounded">
        Create Session &amp; Send Invites
      </button>
    </form>
  );
}
