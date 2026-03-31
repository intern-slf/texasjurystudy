import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export interface AgeRange {
  min: number;
  max: number;
  caseLabel?: string;
  caseIndex?: number;
}

/** Calculate age in years from a date-of-birth string (YYYY-MM-DD or ISO). */
export function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export interface CaseFilters {
  gender?: string[];
  race?: string[];
  age?: AgeRange;
  ageRanges?: AgeRange[];
  location?: { state?: string[]; county?: string[] };
  political_affiliation?: string[];
  eligibility?: {
    served_on_jury?: string;
    has_children?: string;
    served_armed_forces?: string;
    currently_employed?: string;
    convicted_felon?: string;
    us_citizen?: string;
  };
  socioeconomic?: {
    education_level?: string[];
    marital_status?: string[];
    family_income?: string[];
    availability?: string[];
  };
  /** Per-case original filters — populated by combineCaseFilters for UI display */
  _perCaseFilters?: { filters: CaseFilters; caseTitle: string; caseIndex: number }[];
  // Add other loose fields if necessary, based on presenter form
  [key: string]: any;
}

/**
 * Applies case filters to a Supabase query.
 * 
 * @param query The base Supabase query (e.g. supabase.from('jury_participants').select('*'))
 * @param filters The CaseFilters object containing criteria
 * @returns The modified query with filters applied
 */
export function applyCaseFilters(
  query: any,
  filters: CaseFilters
) {
  if (!filters) return query;

  // --- IDENTITY ---
  if (filters.gender?.length) {
    query = query.in("gender", filters.gender);
  }

  if (filters.race?.length) {
    query = query.in("race", filters.race);
  }

  // --- AGE (computed from date_of_birth) ---
  if (filters.ageRanges?.length) {
    // Union of ranges → use widest range to approximate (Supabase can't do OR on same col easily)
    const minAge = Math.min(...filters.ageRanges.map((r) => r.min));
    const maxAge = Math.max(...filters.ageRanges.map((r) => r.max));
    const today = new Date();
    const minDOB = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    const maxDOB = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    query = query.gte("date_of_birth", minDOB).lte("date_of_birth", maxDOB);
  } else if (filters.age) {
    const minAge = filters.age.min ?? 18;
    const maxAge = filters.age.max ?? 99;
    const today = new Date();
    const minDOB = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    const maxDOB = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    query = query.gte("date_of_birth", minDOB).lte("date_of_birth", maxDOB);
  }

  // --- LOCATION ---
  if (filters.location?.state?.length) {
    query = query.in("state", filters.location.state);
  }
  if (filters.location?.county?.length) {
    query = query.in("county", filters.location.county);
  }

  // --- POLITICAL ---
  if (filters.political_affiliation?.length) {
    query = query.in("political_affiliation", filters.political_affiliation);
  }

  // --- SOCIOECONOMIC ---
  if (filters.socioeconomic?.education_level?.length) {
    query = query.in(
      "education_level",
      filters.socioeconomic.education_level
    );
  }

  if (filters.socioeconomic?.marital_status?.length) {
    query = query.in(
      "marital_status",
      filters.socioeconomic.marital_status
    );
  }

  if (filters.socioeconomic?.family_income?.length) {
    query = query.in(
      "family_income",
      filters.socioeconomic.family_income
    );
  }

  if (filters.socioeconomic?.availability) {
    if (filters.socioeconomic.availability.includes("Weekdays")) {
      query = query.eq("availability_weekdays", "Yes");
    }
    if (filters.socioeconomic.availability.includes("Weekends")) {
      query = query.eq("availability_weekends", "Yes");
    }
  }

  // --- ELIGIBILITY ---
  if (filters.eligibility) {
    const e = filters.eligibility;
    const fields = [
      "served_on_jury",
      "has_children",
      "served_armed_forces",
      "currently_employed",
    ];

    fields.forEach(field => {
      const val = e[field as keyof typeof e];
      if (val && val !== "Any") {
        query = query.eq(field, val);
      }
    });
  }

  return query;
}

/**
 * Combines multiple case filters using UNION (OR) logic.
 * 
 * Strategy:
 * - Arrays (Gender, Race, etc): Union of values. Participant passes if they match ANY case.
 * - Ranges: Union — each case's range kept separately.
 * - Single Values (Eligibility): If cases agree → keep. If conflict → undefined (Any).
 * - _perCaseFilters: Stores each case's original filters for per-case UI display.
 */
export function combineCaseFilters(filtersList: CaseFilters[]): CaseFilters {
  if (!filtersList || filtersList.length === 0) return {};
  // Filter out null/undefined entries
  const valid = filtersList.filter(f => f != null);
  if (valid.length === 0) return {};
  if (valid.length === 1) return valid[0];

  const result: CaseFilters = {};

  // --- Store per-case filters for UI ---
  result._perCaseFilters = valid.map((f, idx) => ({
    filters: f,
    caseTitle: `Case ${idx + 1}`, // enriched with real titles later in page.tsx
    caseIndex: idx,
  }));

  // --- IDENTITY ARRAYS (Union) ---
  result.gender = unionArrays(valid.map(f => f.gender));
  result.race = unionArrays(valid.map(f => f.race));

  // --- AGE (Union: keep each case's range separately for per-case UI) ---
  const ageRanges: AgeRange[] = [];
  valid.forEach((f, idx) => {
    if (f.age) {
      ageRanges.push({ ...f.age, caseIndex: idx });
    }
  });
  if (ageRanges.length > 0) {
    result.ageRanges = ageRanges;
  }
  result.political_affiliation = unionArrays(valid.map(f => f.political_affiliation));

  // --- LOCATION (Union) ---
  if (!result.location) result.location = {};
  result.location.state = unionArrays(valid.map(f => f.location?.state));
  result.location.county = unionArrays(valid.map(f => f.location?.county));

  // --- SOCIOECONOMIC (Union) ---
  if (!result.socioeconomic) result.socioeconomic = {};
  result.socioeconomic.education_level = unionArrays(valid.map(f => f.socioeconomic?.education_level));
  result.socioeconomic.marital_status = unionArrays(valid.map(f => f.socioeconomic?.marital_status));
  result.socioeconomic.family_income = unionArrays(valid.map(f => f.socioeconomic?.family_income));
  result.socioeconomic.availability = unionArrays(valid.map(f => f.socioeconomic?.availability));

  // --- ELIGIBILITY (If cases agree → keep, conflict → Any) ---
  if (!result.eligibility) result.eligibility = {};

  const eligibilityFields = [
    "served_on_jury",
    "has_children",
    "served_armed_forces",
    "currently_employed",
  ];

  eligibilityFields.forEach(field => {
    // Collect all non-empty values
    const values = valid
      .map(f => f.eligibility?.[field as keyof typeof f.eligibility])
      .filter(v => v !== undefined && v.toLowerCase() !== "any" && v !== "");

    const uniqueValues = Array.from(new Set(values));

    if (uniqueValues.length === 1) {
      // All cases that specify this field agree
      // @ts-ignore
      result.eligibility[field] = uniqueValues[0];
    } else if (uniqueValues.length > 1) {
      // Conflict — don't filter (union = accept both)
      // @ts-ignore
      result.eligibility[field] = undefined;
    } else {
      // No case specifies this → Any
      // @ts-ignore
      result.eligibility[field] = undefined;
    }
  });

  return result;
}

/**
 * Union of arrays.
 * - If ALL cases have undefined/empty (= "Any"), result is undefined (no filter).
 * - If SOME cases have values and others are undefined ("Any"), collect all values.
 * - If multiple cases have values, return ALL unique values (union).
 */
function unionArrays(arrays: (string[] | undefined)[]): string[] | undefined {
  const defined = arrays.filter((arr): arr is string[] => {
    if (!Array.isArray(arr)) return false;
    if (arr.length === 0) return false;
    if (arr.length === 1 && arr[0].toLowerCase() === "any") return false;
    return true;
  });

  if (defined.length === 0) return undefined;
  if (defined.length === 1) return [...defined[0]];

  // Union: collect all unique values across all cases
  const allValues = new Set<string>();
  for (const arr of defined) {
    for (const v of arr) allValues.add(v);
  }

  return allValues.size > 0 ? Array.from(allValues) : undefined;
}

/**
 * Intersection of arrays (kept for potential future use).
 */
function intersectArrays(arrays: (string[] | undefined)[]): string[] | undefined {
  const defined = arrays.filter((arr): arr is string[] => {
    if (!Array.isArray(arr)) return false;
    if (arr.length === 0) return false;
    if (arr.length === 1 && arr[0].toLowerCase() === "any") return false;
    return true;
  });

  if (defined.length === 0) return undefined;
  if (defined.length === 1) return [...defined[0]];

  let common = new Set<string>(defined[0]);
  for (let i = 1; i < defined.length; i++) {
    const next = new Set<string>(defined[i]);
    common = new Set([...common].filter(v => next.has(v)));
  }

  return common.size > 0 ? Array.from(common) : ["No Common Value"];
}

/* =============================================================================
   FILTER LABEL MAP (shared between sessions/new and InviteMoreModal)
============================================================================= */
export const FILTER_LABELS: Record<string, string> = {
  location: "Location",
  age: "Age",
  race: "Race",
  gender: "Gender",
  socioeconomic: "Socioeconomic",
  eligibility: "Eligibility",
  political_affiliation: "Political Affiliation",
};

/* =============================================================================
   checkArrayForCase — helper used by checkFilterMatch
============================================================================= */
export function checkArrayForCase(
  participant: any,
  caseFilters: CaseFilters,
  field: string,
  pField: string
): { pass: boolean; pVal: string; caseVals: string[] | undefined } {
  const arr = (caseFilters as any)[field] as string[] | undefined;
  const pVal = participant[pField] ?? "";
  if (!arr || arr.length === 0) return { pass: true, pVal, caseVals: undefined };
  return { pass: arr.includes(pVal), pVal, caseVals: arr };
}

/* =============================================================================
   checkFilterMatch — check a participant against the combined filters for one key.
   Returns { passes, detail, subRows?, subTypes? }
============================================================================= */
export function checkFilterMatch(
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
        return { passes: allPass, detail: allPass ? "All cases matched" : "Not all cases matched", subRows };
      }

      const arr = filterVal as string[] | undefined;
      if (!arr || arr.length === 0) return { passes: true, detail: "Any" };
      const match = arr.includes(pVal);
      return { passes: match, detail: `${arr.join(", ")} (participant: ${pVal || "N/A"})` };
    }

    case "age": {
      const dob = participant.date_of_birth as string | null | undefined;
      const participantAge = dob ? calcAgeFromDob(dob) : null;

      if (hasMultipleCases) {
        const subRows: string[] = [];
        let allPass = true;
        for (const pc of perCase!) {
          const range = pc.filters.age;
          if (!range) { subRows.push(`${pc.caseTitle}: Any ✅`); continue; }
          const pass = participantAge !== null && participantAge >= range.min && participantAge <= range.max;
          if (!pass) allPass = false;
          subRows.push(`${pc.caseTitle}: ${range.min}–${range.max} (participant: ${participantAge ?? "N/A"}) ${pass ? "✅" : "❌"}`);
        }
        return { passes: allPass, detail: allPass ? "All cases matched" : "Not all cases matched", subRows };
      }

      const ageFilter = filterVal as AgeRange | undefined;
      if (!ageFilter) return { passes: true, detail: "Any" };
      if (participantAge === null) return { passes: false, detail: "Unknown age (no DOB)" };
      const match = participantAge >= ageFilter.min && participantAge <= ageFilter.max;
      return { passes: match, detail: `${ageFilter.min}–${ageFilter.max} (participant: ${participantAge})` };
    }

    case "location": {
      const pState = participant.state ?? "";
      const pCounty = participant.county ?? "";

      if (hasMultipleCases) {
        const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
        let allPass = true;

        // State
        const stateRows: string[] = [];
        let statePass = true;
        for (const pc of perCase!) {
          const caseStates = pc.filters.location?.state;
          const noFilter = !caseStates || caseStates.length === 0;
          const pass = noFilter || caseStates!.includes(pState);
          if (!pass) statePass = false;
          const needs = noFilter ? "Any" : caseStates!.join(", ");
          stateRows.push(`${pc.caseTitle}: ${needs} (participant: ${pState || "N/A"}) ${pass ? "✅" : "❌"}`);
        }
        if (!statePass) allPass = false;
        subTypes.push({ label: "State", passes: statePass, subRows: stateRows });

        // County
        const countyRows: string[] = [];
        let countyPass = true;
        for (const pc of perCase!) {
          const caseCounties = pc.filters.location?.county;
          const noFilter = !caseCounties || caseCounties.length === 0;
          const pass = noFilter || caseCounties!.includes(pCounty);
          if (!pass) countyPass = false;
          const needs = noFilter ? "Any" : caseCounties!.join(", ");
          countyRows.push(`${pc.caseTitle}: ${needs} (participant: ${pCounty || "N/A"}) ${pass ? "✅" : "❌"}`);
        }
        if (!countyPass) allPass = false;
        subTypes.push({ label: "County", passes: countyPass, subRows: countyRows });

        return { passes: allPass, detail: allPass ? "All cases matched" : "Not all cases matched", subTypes };
      }

      const loc = filterVal as { state?: string[]; county?: string[] } | undefined;
      const stateMatch = !loc?.state?.length || loc.state.includes(pState);
      const countyMatch = !loc?.county?.length || loc.county.includes(pCounty);
      const match = stateMatch && countyMatch;

      const subTypes: { label: string; passes: boolean; subRows: string[] }[] = [];
      subTypes.push({ label: "State", passes: stateMatch, subRows: [`${pState || "N/A"} (Needs: ${loc?.state?.length ? loc.state.join(", ") : "Any"}) ${stateMatch ? "✅" : "❌"}`] });
      subTypes.push({ label: "County", passes: countyMatch, subRows: [`${pCounty || "N/A"} (Needs: ${loc?.county?.length ? loc.county.join(", ") : "Any"}) ${countyMatch ? "✅" : "❌"}`] });

      return { passes: match, detail: match ? "Matches" : "Failed", subTypes };
    }

    case "socioeconomic": {
      if (hasMultipleCases) {
        const subTypeDefs = [
          { label: "Education", field: "education_level", pField: "education_level" },
          { label: "Marital Status", field: "marital_status", pField: "marital_status" },
          { label: "Income", field: "family_income", pField: "family_income" },
          { label: "Availability", field: "availability", pField: null as string | null },
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
              if (!avail || avail.length === 0) { rows.push(`${pc.caseTitle}: Any ✅`); continue; }
              hasAnyRequirement = true;
              const pW = participant.availability_weekdays === "Yes";
              const pE = participant.availability_weekends === "Yes";
              const m = (avail.includes("Weekdays") && pW) || (avail.includes("Weekends") && pE);
              if (!m) typeAllPass = false;
              const pAvail = [pW && "Weekdays", pE && "Weekends"].filter(Boolean).join(", ") || "None";
              rows.push(`${pc.caseTitle}: Needs ${avail.join(", ")} (participant: ${pAvail}) ${m ? "✅" : "❌"}`);
            } else {
              const vals = (socio as any)?.[def.field] as string[] | undefined;
              if (!vals || vals.length === 0) { rows.push(`${pc.caseTitle}: Any ✅`); continue; }
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

        return { passes: allTypesPass, detail: allTypesPass ? "All cases matched" : "Not all cases matched", subTypes };
      }

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

    case "eligibility": {
      const fields = [
        { key: "served_on_jury", label: "Served on Jury" },
        { key: "has_children", label: "Has Children" },
        { key: "served_armed_forces", label: "Armed Forces" },
        { key: "currently_employed", label: "Employed" },
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
            if (!required || required === "Any") { rows.push(`${pc.caseTitle}: Any ✅`); continue; }
            hasAnyRequirement = true;
            const m = pVal === required;
            if (!m) typeAllPass = false;
            rows.push(`${pc.caseTitle}: Needs ${required} (participant: ${pVal}) ${m ? "✅" : "❌"}`);
          }

          if (!hasAnyRequirement) typeAllPass = true;
          if (!typeAllPass) allTypesPass = false;
          subTypes.push({ label: def.label, passes: typeAllPass, subRows: rows });
        }

        return { passes: allTypesPass, detail: allTypesPass ? "All cases matched" : "Not all cases matched", subTypes };
      }

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

// Low index = Dropped First
export const FILTER_PRIORITY = [
  "location",      // Drop location first
  "age",           // Drop age second
  "race",
  "gender",
  "socioeconomic",
  "eligibility",
  "political_affiliation" // Keep this loop longest (Drop last)
];

/**
 * Returns a new filter object with the least important filters removed.
 * @param filters Original filters
 * @param level Number of priority levels to drop (1 = drop 1st, 2 = drop 1st & 2nd...)
 */
export function relaxFilters(filters: CaseFilters, level: number): CaseFilters {
  if (level <= 0) return filters;

  const relaxed = { ...filters }; // Shallow copy

  for (let i = 0; i < level && i < FILTER_PRIORITY.length; i++) {
    const key = FILTER_PRIORITY[i];
    delete relaxed[key];
  }

  return relaxed;
}

/**
 * Returns a numeric score representing how well a participant
 * satisfies the given filters.
 * Higher = better.
 */
/**
 * Evaluate participant against ONE case.
 * Counts every filter & sub-filter.
 */
export function getMatchScoreDetailed(
  participant: any,
  filters: CaseFilters
) {
  if (!filters) return { score: 0, total: 0 };

  let score = 0;
  let total = 0;

  // --- IDENTITY ---
  if (filters.gender?.length) {
    total++;
    if (filters.gender.includes(participant.gender)) score++;
  }

  if (filters.race?.length) {
    total++;
    if (filters.race.includes(participant.race)) score++;
  }

  // --- AGE ---
  if (filters.ageRanges?.length || filters.age) {
    total++;
    const dob = participant.date_of_birth as string | null | undefined;
    const participantAge = dob ? calcAgeFromDob(dob) : null;
    if (participantAge !== null) {
      if (filters.ageRanges?.length) {
        if (filters.ageRanges.some((r) => participantAge >= r.min && participantAge <= r.max)) score++;
      } else if (filters.age) {
        if (participantAge >= filters.age.min && participantAge <= filters.age.max) score++;
      }
    }
  }

  if (filters.political_affiliation?.length) {
    total++;
    if (filters.political_affiliation.includes(participant.political_affiliation)) score++;
  }

  // --- LOCATION ---
  if (filters.location?.state?.length) {
    total++;
    if (filters.location.state.includes(participant.state)) score++;
  }
  if (filters.location?.county?.length) {
    total++;
    if (filters.location.county.includes(participant.county)) score++;
  }

  // --- SOCIOECONOMIC ---
  if (filters.socioeconomic?.education_level?.length) {
    total++;
    if (filters.socioeconomic.education_level.includes(participant.education_level)) score++;
  }

  if (filters.socioeconomic?.marital_status?.length) {
    total++;
    if (filters.socioeconomic.marital_status.includes(participant.marital_status)) score++;
  }

  if (filters.socioeconomic?.family_income?.length) {
    total++;
    if (filters.socioeconomic.family_income.includes(participant.family_income)) score++;
  }

  if (filters.socioeconomic?.availability?.length) {
    total++;

    const ok =
      (filters.socioeconomic.availability.includes("Weekdays") &&
        participant.availability_weekdays === "Yes") ||
      (filters.socioeconomic.availability.includes("Weekends") &&
        participant.availability_weekends === "Yes");

    if (ok) score++;
  }

  // --- ELIGIBILITY ---
  if (filters.eligibility) {
    type EligibilityKey = keyof NonNullable<CaseFilters["eligibility"]>;

    (Object.keys(filters.eligibility) as EligibilityKey[]).forEach((key) => {
      const required = filters.eligibility?.[key];
      if (!required || required === "Any") return;

      total++;
      if (participant[key] === required) score++;
    });
  }

  return { score, total };
}
/**
 * Score participant against MULTIPLE cases.
 * Also returns how many checks were evaluated.
 */
export function getMultiCaseScoreDetailed(
  participant: any,
  filtersList: CaseFilters[]
) {
  let score = 0;
  let total = 0;

  for (const filters of filtersList) {
    const result = getMatchScoreDetailed(participant, filters);
    score += result.score;
    total += result.total;
  }

  return { score, total };
}

/**
 * Attach multi-case score to each participant.
 */
export function attachMultiCaseScores(
  participants: any[],
  filtersList: CaseFilters[]
) {
  return participants.map((p) => {
    const { score, total } = getMultiCaseScoreDetailed(p, filtersList);
    const passCount = getCasePassCount(p, filtersList);

    return {
      ...p,
      multiScore: score,
      multiTotal: total,
      casePassCount: passCount,
    };
  });
}


/**
 * Sort by multi-case score.
 */
export function sortParticipantsByMultiCaseMatch(
  participants: any[]
) {
  return [...participants].sort((a, b) => {
    // 1️⃣ who satisfies more cases
    if (a.casePassCount !== b.casePassCount) {
      return b.casePassCount - a.casePassCount;
    }

    // 2️⃣ who has better overall score
    return b.multiScore - a.multiScore;
  });
}



/**
 * Sort participants by best match first.
 */
export function sortParticipantsByMatch(
  participants: any[],
  filters: CaseFilters
) {
  return participants
    .map(p => ({
      ...p,
      __score: getMatchScoreDetailed(p, filters).score
    }))
    .sort((a, b) => b.__score - a.__score);
}



/**
 * Did participant satisfy ONE entire case?
 */
export function doesParticipantPassCase(
  participant: any,
  filters: CaseFilters
) {
  const { score, total } = getMatchScoreDetailed(participant, filters);
  return total > 0 && score === total;
}

/**
 * Count how many cases participant fully satisfies.
 */
export function getCasePassCount(
  participant: any,
  filtersList: CaseFilters[]
) {
  let passCount = 0;

  for (const filters of filtersList) {
    if (doesParticipantPassCase(participant, filters)) {
      passCount++;
    }
  }

  return passCount;
}
