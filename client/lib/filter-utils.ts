import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export interface CaseFilters {
  gender?: string[];
  age?: { min?: number; max?: number };
  location?: { state?: string[] };
  socioeconomic?: { education_level?: string[] };
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

  if (filters.gender?.length) {
    query = query.in("gender", filters.gender);
  }

  if (filters.age?.min !== undefined) {
    query = query.gte("age", filters.age.min);
  }

  if (filters.age?.max !== undefined) {
    query = query.lte("age", filters.age.max);
  }

  if (filters.location?.state?.length) {
    query = query.in("state", filters.location.state);
  }

  if (filters.socioeconomic?.education_level?.length) {
    query = query.in(
      "education_level",
      filters.socioeconomic.education_level
    );
  }

  return query;
}
