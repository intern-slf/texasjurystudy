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
  AgeRange,
  attachMultiCaseScores,
  sortParticipantsByMultiCaseMatch
} from "@/lib/filter-utils";
import { getAncestorCaseIds, getLineageParticipantIds } from "@/lib/case-lineage";
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

/* ====================================================================
   Helper: check a participant against ONE case for a simple array filter
   Returns { pass, detail }
   ==================================================================== */
function checkArrayForCase(
  participant: any,
  caseFilters: CaseFilters,
  field: string,        // e.g. "gender", "race", "political_affiliation"
  pField: string,       // participant field name (usually same as field)
): { pass: boolean; pVal: string; caseVals: string[] | undefined } {
  const arr = (caseFilters as any)[field] as string[] | undefined;
  const pVal = participant[pField] ?? "";
  if (!arr || arr.length === 0) return { pass: true, pVal, caseVals: undefined };
  return { pass: arr.includes(pVal), pVal, caseVals: arr };
}

/**
 * Check if a participant passes a specific filter.
 * When multiple cases exist, shows per-case breakdowns.
 * passes = true ONLY when ALL cases are satisfied.
 * subTypes = nested expandable sub-sections (for socioeconomic/eligibility).
 */
function checkFilterMatch(
  participant: any,
  filters: CaseFilters | null,
  filterKey: string
): {
  passes: boolean;
  detail: string;
  subRows?: string[];
  subTypes?: { label: string; passes: boolean; subRows: string[] }[];
} {
  if (!filters) return { passes: true, detail: "No filter" };

  const filterVal = (filters as any)[filterKey];
  const perCase = filters._perCaseFilters;
  const hasMultipleCases = perCase && perCase.length > 1;

  switch (filterKey) {
    /* ============= SIMPLE ARRAY FILTERS ============= */
    case "political_affiliation":
    case "gender":
    case "race": {
      const pField = filterKey;
      const pVal = participant[pField] ?? "";

      if (hasMultipleCases) {
        const subRows: string[] = [];
        let allPass = true;

        for (const pc of perCase!) {
          const { pass, caseVals } = checkArrayForCase(participant, pc.filters, filterKey, pField);
          if (!pass) allPass = false;
          const needs = caseVals ? caseVals.join(", ") : "Any";
          subRows.push(`${pc.caseTitle}: ${needs} (participant: ${pVal || "N/A"}) ${pass ? "✅" : "❌"}`);
        }

        return {
          passes: allPass,
          detail: allPass ? "All cases matched" : "Not all cases matched",
          subRows,
        };
      }

      const arr = filterVal as string[] | undefined;
      if (!arr || arr.length === 0) return { passes: true, detail: "Any" };
      const match = arr.includes(pVal);
      return { passes: match, detail: `${arr.join(", ")} (participant: ${pVal || "N/A"})` };
    }

    /* ============= AGE ============= */
    case "age": {
      const caseRanges = (filters as any).ageRanges as AgeRange[] | undefined;
      if (caseRanges && caseRanges.length > 0) {
        const pAge = participant.age;
        const subRows: string[] = [];
        let allPass = true;

        for (const r of caseRanges) {
          const minOk = r.min === undefined || pAge >= r.min;
          const maxOk = r.max === undefined || pAge <= r.max;
          const pass = minOk && maxOk;
          if (!pass) allPass = false;
          const label = r.caseLabel || "Case";
          const rangeStr = `${r.min ?? 0}–${r.max ?? "99+"}`;
          subRows.push(`${label}: ${rangeStr} (participant: ${pAge}) ${pass ? "✅" : "❌"}`);
        }

        return {
          passes: allPass,
          detail: allPass ? "All cases matched" : "Not all cases matched",
          subRows,
        };
      }

      const ageFilter = filterVal as { min?: number; max?: number } | undefined;
      if (!ageFilter) return { passes: true, detail: "Any" };
      const pAge = participant.age;
      const minOk = ageFilter.min === undefined || pAge >= ageFilter.min;
      const maxOk = ageFilter.max === undefined || pAge <= ageFilter.max;
      return {
        passes: minOk && maxOk,
        detail: `${ageFilter.min ?? 0}–${ageFilter.max ?? "99+"} (participant: ${pAge})`,
      };
    }

    /* ============= LOCATION ============= */
    case "location": {
      const pState = participant.state ?? "";

      if (hasMultipleCases) {
        const subRows: string[] = [];
        let allPass = true;

        for (const pc of perCase!) {
          const caseStates = pc.filters.location?.state;
          const noFilter = !caseStates || caseStates.length === 0;
          const pass = noFilter || caseStates!.includes(pState);
          if (!pass) allPass = false;
          const needs = noFilter ? "Any" : caseStates!.join(", ");
          subRows.push(`${pc.caseTitle}: ${needs} (participant: ${pState || "N/A"}) ${pass ? "✅" : "❌"}`);
        }

        return {
          passes: allPass,
          detail: allPass ? "All cases matched" : "Not all cases matched",
          subRows,
        };
      }

      const loc = filterVal as { state?: string[] } | undefined;
      if (!loc?.state || loc.state.length === 0) return { passes: true, detail: "Any" };
      const match = loc.state.includes(pState);
      return { passes: match, detail: `${loc.state.join(", ")} (participant: ${pState || "N/A"})` };
    }

    /* ============= SOCIOECONOMIC (nested sub-types) ============= */
    case "socioeconomic": {
      if (hasMultipleCases) {
        const subTypeDefs = [
          { label: "Education", field: "education_level", pField: "education_level" },
          { label: "Marital Status", field: "marital_status", pField: "marital_status" },
          { label: "Income", field: "family_income", pField: "family_income" },
          { label: "Availability", field: "availability", pField: null as string | null }, // special handling
        ];

        const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
        let allTypesPass = true;

        for (const def of subTypeDefs) {
          const rows: string[] = [];
          let typeAllPass = true;
          let hasAnyRequirement = false;

          for (const pc of perCase!) {
            const socio = pc.filters.socioeconomic;

            if (def.field === "availability") {
              const avail = socio?.availability;
              if (!avail || avail.length === 0) {
                rows.push(`${pc.caseTitle}: Any ✅`);
                continue;
              }
              hasAnyRequirement = true;
              const pW = participant.availability_weekdays === "Yes";
              const pE = participant.availability_weekends === "Yes";
              const m = (avail.includes("Weekdays") && pW) || (avail.includes("Weekends") && pE);
              if (!m) typeAllPass = false;
              const pAvail = [pW && "Weekdays", pE && "Weekends"].filter(Boolean).join(", ") || "None";
              rows.push(`${pc.caseTitle}: Needs ${avail.join(", ")} (participant: ${pAvail}) ${m ? "✅" : "❌"}`);
            } else {
              const vals = (socio as any)?.[def.field] as string[] | undefined;
              if (!vals || vals.length === 0) {
                rows.push(`${pc.caseTitle}: Any ✅`);
                continue;
              }
              hasAnyRequirement = true;
              const pVal = participant[def.pField!] ?? "N/A";
              const m = vals.includes(pVal);
              if (!m) typeAllPass = false;
              rows.push(`${pc.caseTitle}: ${vals.join(", ")} (participant: ${pVal}) ${m ? "✅" : "❌"}`);
            }
          }

          if (!hasAnyRequirement) typeAllPass = true;
          if (!typeAllPass) allTypesPass = false;

          subTypes.push({ label: def.label, passes: typeAllPass, subRows: rows });
        }

        return {
          passes: allTypesPass,
          detail: allTypesPass ? "All cases matched" : "Not all cases matched",
          subTypes,
        };
      }

      // Single-case fallback
      const socio = filterVal as any;
      if (!socio) return { passes: true, detail: "Any" };

      const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
      let allPass = true;

      if (socio.education_level?.length) {
        const m = socio.education_level.includes(participant.education_level);
        if (!m) allPass = false;
        subTypes.push({ label: "Education", passes: m, subRows: [`${participant.education_level} (Needs: ${socio.education_level.join(", ")}) ${m ? "✅" : "❌"}`] });
      } else {
        subTypes.push({ label: "Education", passes: true, subRows: [`${participant.education_level} (Any)`] });
      }

      if (socio.marital_status?.length) {
        const m = socio.marital_status.includes(participant.marital_status);
        if (!m) allPass = false;
        subTypes.push({ label: "Marital Status", passes: m, subRows: [`${participant.marital_status} (Needs: ${socio.marital_status.join(", ")}) ${m ? "✅" : "❌"}`] });
      } else {
        subTypes.push({ label: "Marital Status", passes: true, subRows: [`${participant.marital_status} (Any)`] });
      }

      if (socio.family_income?.length) {
        const m = socio.family_income.includes(participant.family_income);
        if (!m) allPass = false;
        subTypes.push({ label: "Income", passes: m, subRows: [`${participant.family_income} (Needs: ${socio.family_income.join(", ")}) ${m ? "✅" : "❌"}`] });
      } else {
        subTypes.push({ label: "Income", passes: true, subRows: [`${participant.family_income} (Any)`] });
      }

      if (socio.availability?.length) {
        const reqs = socio.availability as string[];
        const pWeekdays = participant.availability_weekdays === "Yes";
        const pWeekends = participant.availability_weekends === "Yes";
        const m = (reqs.includes("Weekdays") && pWeekdays) || (reqs.includes("Weekends") && pWeekends);
        if (!m) allPass = false;
        const pAvail = [pWeekdays && "Weekdays", pWeekends && "Weekends"].filter(Boolean).join(", ") || "None";
        subTypes.push({ label: "Availability", passes: m, subRows: [`${pAvail} (Needs: ${reqs.join(", ")}) ${m ? "✅" : "❌"}`] });
      }

      return { passes: allPass, detail: allPass ? "Matches" : "Failed", subTypes };
    }

    /* ============= ELIGIBILITY (nested sub-types) ============= */
    case "eligibility": {
      const fields = [
        { key: "served_on_jury", label: "Served on Jury" },
        { key: "convicted_felon", label: "Convicted Felon" },
        { key: "us_citizen", label: "US Citizen" },
        { key: "has_children", label: "Has Children" },
        { key: "served_armed_forces", label: "Armed Forces" },
        { key: "currently_employed", label: "Employed" },
        { key: "internet_access", label: "Internet Access" },
      ];

      if (hasMultipleCases) {
        const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
        let allTypesPass = true;

        for (const def of fields) {
          const rows: string[] = [];
          let typeAllPass = true;
          let hasAnyRequirement = false;

          for (const pc of perCase!) {
            const required = pc.filters.eligibility?.[def.key as keyof NonNullable<CaseFilters["eligibility"]>];
            const pVal = participant[def.key] ?? "N/A";

            if (!required || required === "Any") {
              rows.push(`${pc.caseTitle}: Any ✅`);
              continue;
            }
            hasAnyRequirement = true;
            const m = pVal === required;
            if (!m) typeAllPass = false;
            rows.push(`${pc.caseTitle}: Needs ${required} (participant: ${pVal}) ${m ? "✅" : "❌"}`);
          }

          if (!hasAnyRequirement) typeAllPass = true;
          if (!typeAllPass) allTypesPass = false;

          subTypes.push({ label: def.label, passes: typeAllPass, subRows: rows });
        }

        return {
          passes: allTypesPass,
          detail: allTypesPass ? "All cases matched" : "Not all cases matched",
          subTypes,
        };
      }

      // Single-case fallback
      const elig = filterVal as any;
      if (!elig) return { passes: true, detail: "Any" };

      const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
      let allPass = true;

      for (const def of fields) {
        const required = elig[def.key];
        const pVal = participant[def.key] ?? "N/A";

        if (!required || required === "Any") {
          subTypes.push({ label: def.label, passes: true, subRows: [`${pVal} (Any)`] });
          continue;
        }

        const m = pVal === required;
        if (!m) allPass = false;
        subTypes.push({ label: def.label, passes: m, subRows: [`${pVal} (Needs: ${required}) ${m ? "✅" : "❌"}`] });
      }

      return { passes: allPass, detail: allPass ? "Matches" : "Failed", subTypes };
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
  searchParams: Promise<{
    selectedCases?: string | string[];
    test_table?: string;
    limit?: string;
  }>;
}) {
  const supabase = await createClient();

  /* =========================
     READ PARAMS & TABLE SELECTION
  ========================= */
  const params = await searchParams;
  let preferredTable = params?.test_table;

  // AUTO-DETECTION: If no table specified, check if the modern table has any data
  if (!preferredTable) {
    const { count } = await supabase
      .from("jury_participants")
      .select("*", { count: "exact", head: true });

    // If modern table is empty, default to oldData
    preferredTable = (count === 0 || count === null) ? "oldData" : "jury_participants";
  }

  const isOldData = preferredTable === "oldData";
  const testTable = preferredTable;
  const minRequired = params?.limit ? parseInt(params.limit) : 50;

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

  // Enrich ageRanges with actual case titles
  if (combinedFilters.ageRanges && cases) {
    combinedFilters.ageRanges = combinedFilters.ageRanges.map((r) => ({
      ...r,
      caseLabel: r.caseIndex !== undefined && cases[r.caseIndex]
        ? cases[r.caseIndex].title
        : r.caseLabel,
    }));
  }

  // Enrich _perCaseFilters with actual case titles
  if (combinedFilters._perCaseFilters && cases) {
    combinedFilters._perCaseFilters = combinedFilters._perCaseFilters.map((pc) => ({
      ...pc,
      caseTitle: pc.caseIndex !== undefined && cases[pc.caseIndex]
        ? cases[pc.caseIndex].title
        : pc.caseTitle,
    }));
  }

  // DIAGNOSTIC CHECK
  const { count: totalInTable, error: diagnosticError } = await supabase
    .from(testTable)
    .select("*", { count: "exact", head: true });

  const { data: sampleBatch, error: sampleError } = await supabase
    .from(testTable)
    .select("*")
    .limit(1);

  // DEBUG
  // console.log(`[DIAGNOSTIC] Table: ${testTable}`, {
  //   totalInTable,
  //   diagnosticError: diagnosticError?.message,
  //   sampleCount: sampleBatch?.length,
  //   sampleError: sampleError?.message
  // });

  // Participants (Soft Filtered)
  let participants: any[] = [];
  const seenIds = new Set<string>();
  const nowIso = new Date().toISOString();

  // Fetch blacklisted user IDs from roles table (role = 'blacklisted')
  const { data: blacklistedRoles } = await supabase
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: any) => r.user_id as string);

  // --- NEW: Lineage Exclusion Logic ---
  const allLineageParticipantIds: string[] = [];
  if (selectedIds.length > 0) {
    const ancestorIdsBatch = await Promise.all(
      selectedIds.map(id => getAncestorCaseIds(id))
    );
    const uniqueAncestorIds = Array.from(new Set(ancestorIdsBatch.flat()));
    const lineageParticipantIds = await getLineageParticipantIds(uniqueAncestorIds);
    allLineageParticipantIds.push(...lineageParticipantIds);
  }
  // ------------------------------------

  for (let level = 0; level <= FILTER_PRIORITY.length; level++) {
    if (participants.length >= minRequired) break;

    const currentFilters = relaxFilters(combinedFilters, level);

    let query = supabase
      .from(testTable)
      .select("*"); // Fetch all columns so we can compare against filters

    query = applyCaseFilters(query, currentFilters);

    // ── Hard exclusions (never relaxed) ──────────────────────────────
    // Skip modern exclusions for legacy tables (e.g. oldData)
    if (!isOldData) {
      // 1. Skip participants whose role = 'blacklisted' OR in lineage
      const combinedExclusions = Array.from(new Set([...blacklistedIds, ...allLineageParticipantIds]));
      if (combinedExclusions.length > 0) {
        // @ts-ignore
        query = query.not("user_id", "in", `(${combinedExclusions.map(id => `"${id}"`).join(",")})`);
      }
      // 2. Skip participants still in cooldown (eligible_after_at in the future)
      query = query.or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`);
    }
    // ─────────────────────────────────────────────────────────────────

    if (seenIds.size > 0) {
      // @ts-ignore
      const idField = isOldData ? 'id' : 'user_id';
      query = query.not(idField, 'in', `(${Array.from(seenIds).map(id => `"${id}"`).join(',')})`);
    }

    // @ts-ignore
    const { data: batch, error } = await query.limit(minRequired - participants.length + 20);

    // console.log(`[DEBUG] Level ${level} fetch from "${testTable}":`, {
    //   count: batch?.length,
    //   error: error?.message
    // });

    if (batch && batch.length > 0) {
      let newPeeps = batch.filter((p: any) => {
        const pId = p.user_id || p.id;
        return !seenIds.has(pId);
      });
      newPeeps = newPeeps.sort(() => Math.random() - 0.5);

      newPeeps.forEach((p: any) => {
        const pId = p.user_id || p.id;
        seenIds.add(pId);
        p.matchLevel = level;

        // Check each filter against participant's actual data
        p.filterChecks = FILTER_PRIORITY.map((key) => ({
          key,
          label: FILTER_LABELS[key] || key,
          ...checkFilterMatch(p, combinedFilters, key),
        }));

        // Recalculate matchLevel: if ANY filter fails (not all cases pass),
        // bump to at least 1 so it shows "Mismatch Details" instead of "Exact Match"
        const allFiltersPassed = p.filterChecks.every((fc: any) => fc.passes);
        if (!allFiltersPassed && p.matchLevel === 0) {
          p.matchLevel = 1;
        }

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
      await inviteParticipants(sessionId, selectedParticipants, date);
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
      {/* <details open className="border border-yellow-300 bg-yellow-50 rounded p-3 text-xs">
        <summary className="font-bold text-yellow-800 cursor-pointer text-sm">⚠️ Debug: Table & Filter Diagnostics</summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p><span className="font-bold">Active Table:</span> <code className="bg-white px-1 border rounded">{testTable}</code></p>
              <p><span className="font-bold">Table Row Count (Unfiltered):</span> {totalInTable !== null ? totalInTable : "Error"}</p>
              <p><span className="font-bold">Total Participants (Filtered):</span> {participants.length}</p>
            </div>
            <div className="space-y-1">
              <p><span className="font-bold">Match Summary:</span></p>
              <p className="ml-2">Level 0 (Exact): {exactCount}</p>
              <p className="ml-2">Partial Match: {partialCount}</p>
              <p className="ml-2">Fallback: {fallbackCount}</p>
            </div>
          </div>

          {(diagnosticError || sampleError) && (
            <div className="bg-red-50 border border-red-200 p-2 rounded text-red-700">
              <p className="font-bold underline">Supabase Errors:</p>
              <p>Count Query: {diagnosticError?.message || "None"}</p>
              <p>Sample Query: {sampleError?.message || "None"}</p>
            </div>
          )}

          <div className="mt-2">
            <p className="font-bold">Combined Filters:</p>
            <pre className="mt-1 overflow-auto max-h-40 bg-white p-2 border rounded shadow-inner text-[10px] leading-tight">
              {JSON.stringify(combinedFilters, null, 2)}
            </pre>
          </div>
        </div>
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
              <div key={c.id} className="border rounded p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start w-full">
                  <div className="font-medium text-base">{c.title}</div>
                  {c.scheduled_at ? (
                    <div className="text-xs text-right">
                      <div className="text-slate-500 mb-1">
                        {new Date(c.scheduled_at).toLocaleString()}
                      </div>
                      {(!c.schedule_status || c.schedule_status === "pending") && (
                        <span className="inline-block text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          Waiting response
                        </span>
                      )}
                      {c.schedule_status === "accepted" && (
                        <span className="inline-block text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          Accepted
                        </span>
                      )}
                      {c.schedule_status === "rejected" && (
                        <span className="inline-block text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          Rejected
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No time proposed</div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm w-full mt-1 bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="text-slate-500 text-xs font-semibold uppercase mr-auto">Session Time:</span>
                  <input type="time" name={`start_${c.id}`} className="border rounded px-2 py-1 bg-white" required />
                  <span className="text-slate-400">&rarr;</span>
                  <input type="time" name={`end_${c.id}`} className="border rounded px-2 py-1 bg-white" required />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400 italic">No cases selected.</div>
          )}
        </div>

        {/* RIGHT - PARTICIPANTS */}
        <div className="space-y-4">
          <h2 className="font-semibold">Recommended Participants</h2>

          <div className="border rounded divide-y max-h-[500px] overflow-y-auto">
            {participants?.map((p) => {
              const pId = p.user_id || p.id;
              return (
                <div
                  key={pId}
                  className="flex items-center justify-between p-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/dashboard/participant/${p.id}${isOldData ? "?test_table=oldData" : ""}`}
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
                              <div key={fc.key} className={`flex flex-col gap-0.5 ${fc.passes ? "" : "text-red-500"}`}>
                                {fc.subTypes ? (
                                  <details className="group/sub w-full">
                                    <summary className="flex gap-1 items-center cursor-pointer list-none">
                                      <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                      <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                                      <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                                    </summary>
                                    <div className="ml-4 mt-1 space-y-1">
                                      {fc.subTypes.map((st: any, si: number) => (
                                        <details key={si} className="w-full">
                                          <summary className={`flex gap-1 items-center cursor-pointer list-none text-[9px] ${st.passes ? "text-green-700" : "text-red-500"}`}>
                                            <span>{st.passes ? "\u2713" : "\u2717"}</span>
                                            <span className="font-medium underline decoration-dotted">{st.label}</span>
                                            <span className="opacity-60 ml-1">(Click)</span>
                                          </summary>
                                          <ul className="ml-4 mt-0.5 space-y-0.5 text-[9px] bg-white/50 p-1 rounded border border-black/5 text-slate-700">
                                            {st.subRows.map((row: string, ri: number) => (
                                              <li key={ri}>{row}</li>
                                            ))}
                                          </ul>
                                        </details>
                                      ))}
                                    </div>
                                  </details>
                                ) : fc.subRows ? (
                                  <details className="group/sub w-full">
                                    <summary className="flex gap-1 items-center cursor-pointer list-none">
                                      <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                      <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                                      <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                                    </summary>
                                    <ul className="ml-4 mt-1 space-y-0.5 text-[9px] bg-white/50 p-1.5 rounded border border-black/5 text-slate-700">
                                      {fc.subRows.map((row: string, i: number) => (
                                        <li key={i}>{row}</li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : (
                                  <div className="flex gap-1">
                                    <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                    <span className="font-semibold">{fc.label}:</span>
                                    <span>{fc.detail}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Partial / Mismatch Details requested to be visible but red */}
                      {p.matchLevel > 0 && (
                        <details className="inline-block">
                          <summary className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200 text-[10px] font-semibold cursor-pointer select-none list-none hover:bg-red-100 transition-colors">
                            Mismatch Details
                          </summary>
                          <div className="mt-1 p-2 bg-red-50/50 border border-red-100 rounded text-[10px] space-y-0.5">
                            {(p.filterChecks as any[]).map((fc: any) => (
                              <div key={fc.key} className={`flex flex-col gap-0.5 ${fc.passes ? "text-green-700" : "text-red-500"}`}>

                                {fc.subTypes ? (
                                  <details className="group/sub w-full">
                                    <summary className="flex gap-1 items-center cursor-pointer list-none">
                                      <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                      <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                                      <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                                    </summary>
                                    <div className="ml-4 mt-1 space-y-1">
                                      {fc.subTypes.map((st: any, si: number) => (
                                        <details key={si} className="w-full">
                                          <summary className={`flex gap-1 items-center cursor-pointer list-none text-[9px] ${st.passes ? "text-green-700" : "text-red-500"}`}>
                                            <span>{st.passes ? "\u2713" : "\u2717"}</span>
                                            <span className="font-medium underline decoration-dotted">{st.label}</span>
                                            <span className="opacity-60 ml-1">(Click)</span>
                                          </summary>
                                          <ul className="ml-4 mt-0.5 space-y-0.5 text-[9px] bg-white/50 p-1 rounded border border-black/5 text-slate-700">
                                            {st.subRows.map((row: string, ri: number) => (
                                              <li key={ri}>{row}</li>
                                            ))}
                                          </ul>
                                        </details>
                                      ))}
                                    </div>
                                  </details>
                                ) : fc.subRows ? (
                                  <details className="group/sub w-full">
                                    <summary className="flex gap-1 items-center cursor-pointer list-none">
                                      <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                      <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                                      <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                                    </summary>
                                    <ul className="ml-4 mt-1 space-y-0.5 text-[9px] bg-white/50 p-1.5 rounded border border-black/5 text-slate-700">
                                      {fc.subRows.map((row: string, i: number) => (
                                        <li key={i}>{row}</li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : (
                                  <div className="flex gap-1 items-center">
                                    <span>{fc.passes ? "\u2713" : "\u2717"}</span>
                                    <span className="font-semibold">{fc.label}:</span>
                                    <span>{fc.detail}</span>
                                  </div>
                                )}

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
                      value={pId}
                      className="h-4 w-4 ml-2 flex-shrink-0"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {/* ====== SHOW MORE BUTTON ====== */}
          <div className="mt-2">
            <Link
              href={{
                query: { ...params, limit: minRequired + 50 },
              }}
              scroll={false}
              className="block w-full text-center py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
            >
              Show More Participants... (currently {participants.length})
            </Link>
          </div>
        </div>
      </div>

      <button type="submit" className="bg-black text-white px-4 py-2 rounded">
        Create Session &amp; Send Invites
      </button>
    </form>
  );
}
