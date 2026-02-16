import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export interface AgeRange {
  min?: number;
  max?: number;
  caseLabel?: string;   // e.g. "Case A" — set during combine
  caseIndex?: number;   // 0-based index of the source case
}

export interface CaseFilters {
  gender?: string[];
  age?: AgeRange;                  // single-case age range
  ageRanges?: AgeRange[];          // multi-case union (populated by combineCaseFilters)
  race?: string[];
  location?: { state?: string[] };
  political_affiliation?: string[];
  eligibility?: {
    served_on_jury?: string;
    convicted_felon?: string;
    us_citizen?: string;
    has_children?: string;
    served_armed_forces?: string;
    currently_employed?: string;
    internet_access?: string;
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

  // --- AGE (union of ranges when multiple cases) ---
  if (filters.ageRanges && filters.ageRanges.length > 0) {
    // Build OR condition: participant fits ANY of the case age ranges
    const orClauses = filters.ageRanges.map((r) => {
      const parts: string[] = [];
      if (r.min !== undefined) parts.push(`age.gte.${r.min}`);
      if (r.max !== undefined) parts.push(`age.lte.${r.max}`);
      return parts.length > 1 ? `and(${parts.join(",")})` : parts[0] || "";
    }).filter(Boolean);

    if (orClauses.length === 1) {
      // Single range — apply directly
      const r = filters.ageRanges[0];
      if (r.min !== undefined) query = query.gte("age", r.min);
      if (r.max !== undefined) query = query.lte("age", r.max);
    } else if (orClauses.length > 1) {
      query = query.or(orClauses.join(","));
    }
  } else if (filters.age) {
    // Single-case fallback
    if (filters.age.min !== undefined) {
      query = query.gte("age", filters.age.min);
    }
    if (filters.age.max !== undefined) {
      query = query.lte("age", filters.age.max);
    }
  }

  // --- LOCATION ---
  if (filters.location?.state?.length) {
    query = query.in("state", filters.location.state);
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
      "convicted_felon",
      "us_citizen",
      "has_children",
      "served_armed_forces",
      "currently_employed",
      "internet_access"
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
 * - Ranges (Age): Union — each case's range kept separately.
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
  result.political_affiliation = unionArrays(valid.map(f => f.political_affiliation));

  // --- AGE (Union of ranges — keep each case's range separate) ---
  const ages = valid.map((f, idx) => {
    if (!f.age) return null;
    const isEffectivelyAny =
      (f.age.min === undefined || f.age.min <= 18) &&
      (f.age.max === undefined || f.age.max >= 99);
    if (isEffectivelyAny) return null;
    return {
      min: f.age.min,
      max: f.age.max,
      caseLabel: `Case ${idx + 1}`,
      caseIndex: idx,
    } as AgeRange;
  }).filter(Boolean) as AgeRange[];

  if (ages.length > 0) {
    result.ageRanges = ages;
    // Also set result.age to the widest envelope for backward compat
    const allMins = ages.map(a => a.min ?? 0);
    const allMaxes = ages.map(a => a.max ?? 100);
    result.age = {
      min: Math.min(...allMins),
      max: Math.max(...allMaxes),
    };
  }

  // --- LOCATION (Union) ---
  if (!result.location) result.location = {};
  result.location.state = unionArrays(valid.map(f => f.location?.state));

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
    "convicted_felon",
    "us_citizen",
    "has_children",
    "served_armed_forces",
    "currently_employed",
    "internet_access"
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

// Low index = Dropped First
export const FILTER_PRIORITY = [
  "location",      // Drop location first (least important?)
  "age",
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

  if (filters.political_affiliation?.length) {
    total++;
    if (filters.political_affiliation.includes(participant.political_affiliation)) score++;
  }

  // --- AGE ---
  if (filters.age) {
    total++;
    const { min, max } = filters.age;
    if (
      (min === undefined || participant.age >= min) &&
      (max === undefined || participant.age <= max)
    ) {
      score++;
    }
  }

  // --- LOCATION ---
  if (filters.location?.state?.length) {
    total++;
    if (filters.location.state.includes(participant.state)) score++;
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
