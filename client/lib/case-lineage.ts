import { createClient } from "@/lib/supabase/server";

/**
 * Recursively fetches all ancestor case IDs for a given case.
 */
export async function getAncestorCaseIds(caseId: string): Promise<string[]> {
  const supabase = await createClient();
  const ancestors: string[] = [];
  let currentId: string | null = caseId;

  while (currentId) {
    const { data, error }: { data: { parent_case_id: string | null } | null, error: any } = await supabase
      .from("cases")
      .select("parent_case_id")
      .eq("id", currentId)
      .single();

    if (error || !data?.parent_case_id) {
      break;
    }

    ancestors.push(data.parent_case_id);
    currentId = data.parent_case_id;
    
    // Safety break for cycles (though shouldn't happen with tree structure)
    if (ancestors.length > 20) break;
  }

  return ancestors;
}

/**
 * Fetches IDs of all participants who were invited to sessions 
 * associated with any case in the given lineage.
 */
export async function getLineageParticipantIds(caseIds: string[]): Promise<string[]> {
  if (caseIds.length === 0) return [];

  const supabase = await createClient();

  // 1. Get all session IDs for these cases
  const { data: sessionCases, error: scError } = await supabase
    .from("session_cases")
    .select("session_id")
    .in("case_id", caseIds);

  if (scError || !sessionCases?.length) return [];

  const sessionIds = sessionCases.map(sc => sc.session_id);

  // 2. Get all participants from these sessions
  // We include all who were invited (status doesn't matter for "different people")
  const { data: participants, error: pError } = await supabase
    .from("session_participants")
    .select("participant_id")
    .in("session_id", sessionIds);

  if (pError || !participants?.length) return [];

  return Array.from(new Set(participants.map(p => p.participant_id)));
}

/**
 * Fetches full details of participants across the lineage for display.
 */
export async function getLineageParticipantDetails(caseIds: string[]) {
    if (caseIds.length === 0) return [];
  
    const supabase = await createClient();
  
    // 1. Fetch cases and their session participants (profiles only)
    const { data, error } = await supabase
      .from("cases")
      .select(`
        id,
        title,
        session_cases (
          session_id,
          sessions (
            session_date,
            session_participants (
              participant_id,
              profiles!participant_id (
                email,
                full_name
              ),
              invite_status
            )
          )
        )
      `)
      .in("id", caseIds);
  
    if (error) throw error;
    if (!data) return [];

    // 2. Collect all unique participant IDs
    const participantIds = new Set<string>();
    data.forEach((caseItem: any) => {
        caseItem.session_cases?.forEach((sc: any) => {
            sc.sessions?.session_participants?.forEach((p: any) => {
                if (p.participant_id) participantIds.add(p.participant_id);
            });
        });
    });

    const uniqueIds = Array.from(participantIds);
    let juryDetailsMap: Record<string, any> = {};

    // 3. Fetch jury participants details separately
    if (uniqueIds.length > 0) {
        const { data: juryData, error: juryError } = await supabase
            .from("jury_participants")
            .select("user_id, first_name, last_name, email")
            .in("user_id", uniqueIds);

        if (!juryError && juryData) {
            juryData.forEach(jd => {
                juryDetailsMap[jd.user_id] = jd;
            });
        }

        // FALLBACK: Check oldData for missing participants
        const missingIds = uniqueIds.filter(id => !juryDetailsMap[id]);
        if (missingIds.length > 0) {
            const { data: oldData, error: oldError } = await supabase
                .from("oldData")
                .select("id, first_name, last_name, email")
                .in("id", missingIds);
            
            if (!oldError && oldData) {
                oldData.forEach(od => {
                    juryDetailsMap[od.id] = {
                        user_id: od.id,
                        first_name: od.first_name,
                        last_name: od.last_name,
                        email: od.email
                    };
                });
            }
        }
    }

    // 4. Merge jury details back into the structure
    return data.map((caseItem: any) => ({
        ...caseItem,
        session_cases: caseItem.session_cases?.map((sc: any) => ({
            ...sc,
            sessions: {
                ...sc.sessions,
                session_participants: sc.sessions?.session_participants?.map((p: any) => ({
                    ...p,
                    jury_participants: juryDetailsMap[p.participant_id] || null
                }))
            }
        }))
    }));
}
