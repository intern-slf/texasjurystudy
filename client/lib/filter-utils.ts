import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export interface CaseFilters {
  gender?: string[];
  age?: { min?: number; max?: number };
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

  if (filters.age?.min !== undefined) {
    query = query.gte("age", filters.age.min);
  }

  if (filters.age?.max !== undefined) {
    query = query.lte("age", filters.age.max);
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
 * Combines multiple case filters into a single strict filter (Intersection / AND logic).
 * 
 * Strategy:
 * - Arrays (Gender, Race, etc): Intersection of values. If one case has ["Republican"]
 *   and another has ["Democrat", "Republican"], result = ["Republican"].
 *   If one case has a filter and another doesn't (undefined = "Any"), keep the filter.
 * - Ranges (Age): Tightest range (highest min, lowest max).
 * - Single Values (Eligibility): Keep the value if ANY case requires it.
 *   If cases conflict ("Yes" vs "No"), keep the stricter one (first encountered).
 */
export function combineCaseFilters(filtersList: CaseFilters[]): CaseFilters {
  if (!filtersList || filtersList.length === 0) return {};
  // Filter out null/undefined entries
  const valid = filtersList.filter(f => f != null);
  if (valid.length === 0) return {};
  if (valid.length === 1) return valid[0];

  const result: CaseFilters = {};

  // --- IDENTITY ARRAYS (Intersection) ---
  result.gender = intersectArrays(valid.map(f => f.gender));
  result.race = intersectArrays(valid.map(f => f.race));
  result.political_affiliation = intersectArrays(valid.map(f => f.political_affiliation));

  // --- AGE (Tightest range) ---
  const ages = valid.map(f => f.age).filter(Boolean);
  if (ages.length > 0) {
    const min = Math.max(...ages.map(a => a?.min ?? 0));
    const max = Math.min(...ages.map(a => a?.max ?? 100));
    if (isFinite(min) || isFinite(max)) {
        result.age = { 
            min: isFinite(min) ? min : undefined, 
            max: isFinite(max) ? max : undefined 
        };
    }
  }

  // --- LOCATION (Intersection) ---
  if (!result.location) result.location = {};
  result.location.state = intersectArrays(valid.map(f => f.location?.state));

  // --- SOCIOECONOMIC (Intersection) ---
  if (!result.socioeconomic) result.socioeconomic = {};
  result.socioeconomic.education_level = intersectArrays(valid.map(f => f.socioeconomic?.education_level));
  result.socioeconomic.marital_status = intersectArrays(valid.map(f => f.socioeconomic?.marital_status));
  result.socioeconomic.family_income = intersectArrays(valid.map(f => f.socioeconomic?.family_income));
  result.socioeconomic.availability = intersectArrays(valid.map(f => f.socioeconomic?.availability));

  // --- ELIGIBILITY (Keep if ANY case requires it) ---
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
        .filter(v => v !== undefined && v !== "Any" && v !== "");
      
      const uniqueValues = Array.from(new Set(values));

      if (uniqueValues.length === 1) {
          // All cases that specify this field agree
          // @ts-ignore
          result.eligibility[field] = uniqueValues[0];
      } else if (uniqueValues.length > 1) {
          // Conflict — keep the first case's value (stricter = first wins)
          // @ts-ignore
          result.eligibility[field] = uniqueValues[0];
      } else {
          // No case specifies this → Any
          // @ts-ignore
          result.eligibility[field] = undefined;
      }
  });

  return result;
}

/**
 * Intersection of arrays. 
 * - If ALL cases have undefined/empty (= "Any"), result is undefined (no filter).
 * - If SOME cases have values and others are undefined ("Any"), keep the values from the cases that have them.
 * - If multiple cases have values, return only the common (intersected) values.
 */
function intersectArrays(arrays: (string[] | undefined)[]): string[] | undefined {
    // Collect only the arrays that actually have filter values
    const defined = arrays.filter((arr): arr is string[] => Array.isArray(arr) && arr.length > 0);

    // No case specifies this filter → no restriction
    if (defined.length === 0) return undefined;

    // Only one case specifies it → use that case's values
    if (defined.length === 1) return [...defined[0]];

    // Multiple cases specify it → intersect
    let common = new Set<string>(defined[0]);
    for (let i = 1; i < defined.length; i++) {
        const next = new Set<string>(defined[i]);
        common = new Set([...common].filter(v => next.has(v)));
    }

    return common.size > 0 ? Array.from(common) : undefined;
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
