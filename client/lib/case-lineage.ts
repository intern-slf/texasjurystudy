import { createClient } from "@/lib/supabase/server";

/**
 * Represents a single node in the follow-up case linked list.
 * Each node points to its parent (prev) and children (next) forming a chain.
 */
export interface CaseChainNode {
  id: string;
  title: string;
  status: string;
  admin_status: string;
  created_at: string;
  parent_case_id: string | null;
  participants: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    invite_status: string;
  }[];
}

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
 * Fetches all descendant case IDs (children, grandchildren, etc.)
 */
export async function getDescendantCaseIds(caseId: string): Promise<string[]> {
  const supabase = await createClient();
  const descendants: string[] = [];
  const queue: string[] = [caseId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const { data, error } = await supabase
      .from("cases")
      .select("id")
      .eq("parent_case_id", currentId)
      .is("deleted_at", null);

    if (error || !data?.length) continue;

    for (const child of data) {
      descendants.push(child.id);
      queue.push(child.id);
    }

    if (descendants.length > 50) break; // safety
  }

  return descendants;
}

/**
 * Builds the full follow-up chain as a linked list.
 * Walks up to the root ancestor, then collects all descendants.
 * Returns nodes ordered from root -> ... -> current -> ... -> latest descendant.
 */
export async function getFullCaseChain(caseId: string): Promise<CaseChainNode[]> {
  const supabase = await createClient();

  // 1. Walk up to root
  const ancestors = await getAncestorCaseIds(caseId);
  const rootId = ancestors.length > 0 ? ancestors[ancestors.length - 1] : caseId;

  // 2. Collect all descendant IDs from root (includes current case)
  const descendantIds = await getDescendantCaseIds(rootId);
  const allIds = [rootId, ...descendantIds];

  // 3. Fetch case details for all nodes
  const { data: cases, error: casesError } = await supabase
    .from("cases")
    .select("id, title, status, admin_status, created_at, parent_case_id")
    .in("id", allIds);

  if (casesError || !cases?.length) return [];

  // 4. Fetch participants for each case via session_cases -> session_participants
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id, session_id")
    .in("case_id", allIds);

  const sessionIds = [...new Set((sessionCases ?? []).map((sc) => sc.session_id))];

  let participantsBySession: Record<string, { participant_id: string; invite_status: string }[]> = {};
  if (sessionIds.length > 0) {
    const { data: sp } = await supabase
      .from("session_participants")
      .select("session_id, participant_id, invite_status")
      .in("session_id", sessionIds);

    for (const row of sp ?? []) {
      if (!participantsBySession[row.session_id]) participantsBySession[row.session_id] = [];
      participantsBySession[row.session_id].push(row);
    }
  }

  // Map case_id -> session_ids
  const caseSessionMap: Record<string, string[]> = {};
  for (const sc of sessionCases ?? []) {
    if (!caseSessionMap[sc.case_id]) caseSessionMap[sc.case_id] = [];
    caseSessionMap[sc.case_id].push(sc.session_id);
  }

  // Collect all participant IDs across the chain
  const allParticipantIds = new Set<string>();
  for (const sessions of Object.values(participantsBySession)) {
    for (const p of sessions) allParticipantIds.add(p.participant_id);
  }

  // 5. Fetch participant details
  let juryDetailsMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
  const uniquePIds = Array.from(allParticipantIds);
  if (uniquePIds.length > 0) {
    const { data: juryData } = await supabase
      .from("jury_participants")
      .select("user_id, first_name, last_name, email")
      .in("user_id", uniquePIds);

    for (const jd of juryData ?? []) {
      juryDetailsMap[jd.user_id] = jd;
    }

    // Fallback to oldData
    const missingIds = uniquePIds.filter((id) => !juryDetailsMap[id]);
    if (missingIds.length > 0) {
      const { data: oldData } = await supabase
        .from("oldData")
        .select("id, first_name, last_name, email")
        .in("id", missingIds);

      for (const od of oldData ?? []) {
        juryDetailsMap[od.id] = { first_name: od.first_name, last_name: od.last_name, email: od.email };
      }
    }
  }

  // 6. Build chain nodes
  const nodeMap = new Map<string, CaseChainNode>();
  for (const c of cases) {
    const caseSessions = caseSessionMap[c.id] ?? [];
    const participants: CaseChainNode["participants"] = [];
    const seenPIds = new Set<string>();

    for (const sid of caseSessions) {
      for (const sp of participantsBySession[sid] ?? []) {
        if (seenPIds.has(sp.participant_id)) continue;
        seenPIds.add(sp.participant_id);
        const details = juryDetailsMap[sp.participant_id];
        participants.push({
          id: sp.participant_id,
          first_name: details?.first_name ?? "Unknown",
          last_name: details?.last_name ?? "",
          email: details?.email ?? "",
          invite_status: sp.invite_status,
        });
      }
    }

    nodeMap.set(c.id, {
      id: c.id,
      title: c.title,
      status: c.status,
      admin_status: c.admin_status,
      created_at: c.created_at,
      parent_case_id: c.parent_case_id,
      participants,
    });
  }

  // 7. Order as linked list: root first, walk children
  const ordered: CaseChainNode[] = [];
  const childMap: Record<string, string[]> = {};
  for (const c of cases) {
    const parent = c.parent_case_id;
    if (parent && allIds.includes(parent)) {
      if (!childMap[parent]) childMap[parent] = [];
      childMap[parent].push(c.id);
    }
  }

  // BFS from root to build ordered list
  const bfsQueue = [rootId];
  const visited = new Set<string>();
  while (bfsQueue.length > 0) {
    const id = bfsQueue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeMap.get(id);
    if (node) ordered.push(node);
    const children = childMap[id] ?? [];
    // Sort children by created_at for deterministic ordering
    children.sort((a, b) => {
      const na = nodeMap.get(a);
      const nb = nodeMap.get(b);
      return (na?.created_at ?? "").localeCompare(nb?.created_at ?? "");
    });
    bfsQueue.push(...children);
  }

  return ordered;
}

/**
 * Gets all participant IDs that are blocked from future follow-ups of this case.
 * This includes ALL participants across the entire follow-up chain (ancestors + descendants).
 */
export async function getBlockedParticipantIds(caseId: string): Promise<string[]> {
  const ancestors = await getAncestorCaseIds(caseId);
  const descendants = await getDescendantCaseIds(caseId);
  const allRelatedIds = [...ancestors, caseId, ...descendants];
  return getLineageParticipantIds(allRelatedIds);
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
