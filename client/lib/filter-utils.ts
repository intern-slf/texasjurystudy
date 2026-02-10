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
 * Combines multiple case filters into a single broad filter (Union-like logic).
 * 
 * Strategy:
 * - Arrays (Gender, Race, etc): Union of all unique values.
 * - Ranges (Age): Widest range (lowest min, highest max).
 * - Single Values (Eligibility): 
 *    - If all agree (e.g. all "Yes"), keep "Yes".
 *    - If disjoint (one "Yes", one "No"), remove filter (allow "Any").
 *    - If one has filter and other doesn't (undefined/"Any"), remove filter (allow "Any") to be inclusive.
 */
export function combineCaseFilters(filtersList: CaseFilters[]): CaseFilters {
  if (!filtersList || filtersList.length === 0) return {};
  if (filtersList.length === 1) return filtersList[0];

  const result: CaseFilters = {};

  // --- IDENTITY ARRAYS ---
  result.gender = uniqueUnion(filtersList.map(f => f.gender));
  result.race = uniqueUnion(filtersList.map(f => f.race));
  result.political_affiliation = uniqueUnion(filtersList.map(f => f.political_affiliation));

  // --- AGE ---
  const ages = filtersList.map(f => f.age).filter(Boolean);
  if (ages.length > 0) {
    const min = Math.min(...ages.map(a => a?.min ?? 0));
    const max = Math.max(...ages.map(a => a?.max ?? 100)); // clamp to reasonable default if missing
    // Only set if we have valid numbers
    if (isFinite(min) || isFinite(max)) {
        result.age = { 
            min: isFinite(min) ? min : undefined, 
            max: isFinite(max) ? max : undefined 
        };
    }
  }

  // --- LOCATION ---
  if (!result.location) result.location = {};
  result.location.state = uniqueUnion(filtersList.map(f => f.location?.state));

  // --- SOCIOECONOMIC ---
  if (!result.socioeconomic) result.socioeconomic = {};
  result.socioeconomic.education_level = uniqueUnion(filtersList.map(f => f.socioeconomic?.education_level));
  result.socioeconomic.marital_status = uniqueUnion(filtersList.map(f => f.socioeconomic?.marital_status));
  result.socioeconomic.family_income = uniqueUnion(filtersList.map(f => f.socioeconomic?.family_income));
  result.socioeconomic.availability = uniqueUnion(filtersList.map(f => f.socioeconomic?.availability));

  // --- ELIGIBILITY (Single Values) ---
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
      const values = filtersList
        .map(f => f.eligibility?.[field as keyof typeof f.eligibility])
        .filter(v => v !== undefined && v !== "Any" && v !== "");
      
      const uniqueValues = Array.from(new Set(values));

      // If everyone agrees on a single constraint (e.g. all "Yes"), keep it.
      // If we have "Yes" and "No", conflict -> remove filter.
      // If we have ["Yes"] but some cases had NO value (undefined/"Any"), 
      // strict union says we should allow "Any", so strictly we should remove the filter.
      // Example: Case A="Yes", Case B="Any". A wants Yes. B accepts Anyone.
      // Combined session needs to accommodate B's people too, so we must allow Any.
      // THUS: matches only if ALL filters had the SAME value and NONE were missing/Any.
      
      // However, if logic is "Show me candidates for A OR B", then:
      // Candidates(A) = Yes. Candidates(B) = All. 
      // Union = All.
      // So yes, if ANY case is missing the filter (undefined), the result handles "Any".
      
      const allHaveIt = filtersList.every(f => {
          const v = f.eligibility?.[field as keyof typeof f.eligibility];
          return v !== undefined && v !== "Any" && v !== "";
      });

      if (uniqueValues.length === 1 && allHaveIt) {
          // @ts-ignore
          result.eligibility[field] = uniqueValues[0];
      } else {
          // Conflict or Missing -> Any
          // @ts-ignore
          result.eligibility[field] = undefined;
      }
  });

  return result;
}

function uniqueUnion(arrays: (string[] | undefined)[]): string[] | undefined {
    const set = new Set<string>();
    let hasValues = false;
    
    // Logic: If one case has ["TX"] and another has undefined (Any), should we filter to TX?
    // Case A: lives in TX. Case B: Any.
    // Union = Any.
    // So if ANY case has undefined (Any), the result is undefined (Any).
    // Wait, typical UI logic for "Any" in array often means "All selected" or "No filter".
    // If Case A filters to TX, and Case B has no filter...
    // Candidates A: Texans. Candidates B: Everyone.
    // Union: Everyone.

    // So we only apply a filter if ALL cases have a filter.
    const allHaveFilter = arrays.every(arr => Array.isArray(arr) && arr.length > 0);
    
    if (!allHaveFilter) return undefined;

    arrays.forEach(arr => {
        if (arr) {
            arr.forEach(v => set.add(v));
            hasValues = true;
        }
    });

    return hasValues ? Array.from(set) : undefined;
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
