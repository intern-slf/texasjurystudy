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
    /** Struck in any session this case ran in — outranks invite_status in the UI. */
    struck: boolean;
  }[];
}

/**
 * Recursively fetches all ancestor case IDs for a given case.
 */
export async function getAncestorCaseIds(
  caseId: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const supabase = client ?? (await createClient());
  const ancestors: string[] = [];
  let currentId: string | null = caseId;

  while (currentId) {
    const { data, error } = await supabase
      .from("cases")
      .select("parent_case_id")
      .eq("id", currentId)
      .single() as { data: { parent_case_id: string | null } | null; error: { message?: string } | null };

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
export async function getDescendantCaseIds(
  caseId: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const supabase = client ?? (await createClient());
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

  const participantsBySession: Record<
    string,
    { participant_id: string; invite_status: string; struck_at?: string | null }[]
  > = {};
  if (sessionIds.length > 0) {
    const { data: sp } = await supabase
      .from("session_participants")
      .select("session_id, participant_id, invite_status, struck_at")
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
  const juryDetailsMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
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
        if (seenPIds.has(sp.participant_id)) {
          // A case can span sessions. If they were struck in any of them, that
          // wins — otherwise the first session seen would hide the strike.
          if (sp.struck_at) {
            const already = participants.find((p) => p.id === sp.participant_id);
            if (already) already.struck = true;
          }
          continue;
        }
        seenPIds.add(sp.participant_id);
        const details = juryDetailsMap[sp.participant_id];
        participants.push({
          id: sp.participant_id,
          first_name: details?.first_name ?? "Unknown",
          last_name: details?.last_name ?? "",
          email: details?.email ?? "",
          invite_status: sp.invite_status,
          struck: Boolean(sp.struck_at),
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

/* =========================
   LINEAGE INVOLVEMENT

   Being *invited* to a case in a chain is not the same as being *spent* on it.
   Someone who declined, never answered a past invite, or accepted and was then
   struck never actually sat on the case, so a follow-up can still draw them.
   Only these two states consume a participant:

     accepted          — they sat on (or are confirmed to sit on) a case here
     pending-upcoming  — invited to a session that hasn't happened yet; blocking
                         them until they answer stops the same person accepting
                         two sessions in one chain

   Everything else is surfaced as history (see `isLineageBlocking`) so an admin
   can see the prior invite without being stopped by it.
========================= */
export type LineageInvolvement =
  | "accepted"
  | "pending-upcoming"
  | "struck"
  | "declined"
  | "no-response";

/** True when this involvement spends the participant on the chain. */
export function isLineageBlocking(involvement: LineageInvolvement): boolean {
  return involvement === "accepted" || involvement === "pending-upcoming";
}

/**
 * Splits an involvement map into the ids that block an invite and the ids that
 * only carry history worth showing next to a still-selectable name.
 */
export function splitLineageInvolvement(involvement: Map<string, LineageInvolvement>) {
  const blockedIds: string[] = [];
  const priorInvolvement = new Map<string, LineageInvolvement>();
  for (const [id, value] of involvement) {
    if (isLineageBlocking(value)) blockedIds.push(id);
    else priorInvolvement.set(id, value);
  }
  return { blockedIds, priorInvolvement };
}

/** Highest wins when one person appears on several cases in the same chain. */
const INVOLVEMENT_RANK: Record<LineageInvolvement, number> = {
  accepted: 4,
  "pending-upcoming": 3,
  struck: 2,
  declined: 1,
  "no-response": 0,
};

function classifyInvolvement(
  row: { invite_status?: string | null; struck_at?: string | null },
  isUpcoming: boolean,
): LineageInvolvement {
  // A strike outranks the status it was applied to: they accepted and then
  // backed out or never showed, so they never actually sat on the case.
  if (row.struck_at) return "struck";
  if (row.invite_status === "accepted") return "accepted";
  if (row.invite_status === "declined" || row.invite_status === "rejected") return "declined";
  return isUpcoming ? "pending-upcoming" : "no-response";
}

/** Every case in the same follow-up chain as each of `caseIds`, deduped. */
async function getRelatedCaseIds(
  caseIds: string[],
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const related = await Promise.all(
    caseIds.map(async (id) => {
      const [ancestors, descendants] = await Promise.all([
        getAncestorCaseIds(id, client),
        getDescendantCaseIds(id, client),
      ]);
      return [...ancestors, id, ...descendants];
    })
  );
  return Array.from(new Set(related.flat()));
}

/**
 * Gets all participant IDs that are blocked from future follow-ups of this case.
 * Spans the entire follow-up chain (ancestors + descendants); see
 * `LineageInvolvement` for which invites actually block.
 */
export async function getBlockedParticipantIds(
  caseId: string,
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  return getLineageParticipantIds(await getRelatedCaseIds([caseId], client), client);
}

/**
 * Involvement across every case attached to a session — the union of each
 * case's follow-up chain. Used by the invite-more paths so the recommended list
 * and the search box agree on who is already "spent" on these matters. Keeps
 * *why* each person turned up, since callers show the non-blocking history
 * ("previously invited — declined") next to a still-selectable name.
 */
export async function getLineageInvolvementForCases(
  caseIds: string[],
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, LineageInvolvement>> {
  if (!caseIds.length) return new Map();
  return getLineageParticipantInvolvement(await getRelatedCaseIds(caseIds, client), client);
}

/**
 * Classifies every participant ever invited to a session on one of these cases.
 * Collecting the related cases first and resolving participants in one query
 * matters — this runs per session on the admin sessions page.
 */
export async function getLineageParticipantInvolvement(
  caseIds: string[],
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, LineageInvolvement>> {
  const involvement = new Map<string, LineageInvolvement>();
  if (caseIds.length === 0) return involvement;

  const supabase = client ?? (await createClient());

  // 1. Get all session IDs for these cases
  const { data: sessionCases, error: scError } = await supabase
    .from("session_cases")
    .select("session_id")
    .in("case_id", caseIds);

  if (scError || !sessionCases?.length) return involvement;

  const sessionIds = Array.from(
    new Set(
      sessionCases
        .map((sc: { session_id: string | null }) => sc.session_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );
  if (!sessionIds.length) return involvement;

  // 2. Session dates decide whether an unanswered invite is still live, and the
  //    invite rows carry the status itself.
  const [{ data: sessions }, { data: participants, error: pError }] = await Promise.all([
    supabase.from("sessions").select("id, session_date").in("id", sessionIds),
    supabase
      .from("session_participants")
      .select("participant_id, session_id, invite_status, struck_at")
      .in("session_id", sessionIds),
  ]);

  if (pError || !participants?.length) return involvement;

  // `session_date` is a plain date column, so comparing it lexically against
  // today's YYYY-MM-DD is enough — the same test the admin sessions list uses.
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingSessionIds = new Set(
    ((sessions ?? []) as { id: string; session_date: string | null }[])
      .filter((s) => (s.session_date ?? "") >= todayStr)
      .map((s) => s.id)
  );

  type InviteRow = {
    participant_id: string | null;
    session_id: string | null;
    invite_status: string | null;
    struck_at: string | null;
  };
  for (const row of participants as InviteRow[]) {
    if (!row.participant_id) continue;
    const next = classifyInvolvement(row, upcomingSessionIds.has(row.session_id ?? ""));
    const current = involvement.get(row.participant_id);
    if (!current || INVOLVEMENT_RANK[next] > INVOLVEMENT_RANK[current]) {
      involvement.set(row.participant_id, next);
    }
  }

  return involvement;
}

/**
 * IDs of participants who are spent on the given lineage — i.e. accepted, or
 * sitting on an unanswered invite to a session that hasn't happened yet.
 * Declined, past no-response and struck invites do NOT block.
 */
export async function getLineageParticipantIds(
  caseIds: string[],
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const involvement = await getLineageParticipantInvolvement(caseIds, client);
  return Array.from(involvement)
    .filter(([, v]) => isLineageBlocking(v))
    .map(([id]) => id);
}

/**
 * Fetches full details of participants across the lineage for display.
 */
export async function getLineageParticipantDetails(caseIds: string[]) {
    if (caseIds.length === 0) return [];
  
    const supabase = await createClient();
  
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
              invite_status
            )
          )
        )
      `)
      .in("id", caseIds);
  
    if (error) throw error;
    if (!data) return [];

    type LineageParticipant = {
      participant_id: string | null;
      invite_status?: string | null;
      [key: string]: unknown;
    };
    type LineageSession = {
      session_date?: string | null;
      session_participants?: LineageParticipant[] | null;
      [key: string]: unknown;
    };
    type LineageSessionCase = {
      session_id?: string | null;
      sessions?: LineageSession | LineageSession[] | null;
      [key: string]: unknown;
    };
    type LineageCaseItem = {
      id: string;
      title?: string | null;
      session_cases?: LineageSessionCase[] | null;
      [key: string]: unknown;
    };
    type JuryDetails = {
      user_id?: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    };

    // 2. Collect all unique participant IDs
    const participantIds = new Set<string>();
    (data as unknown as LineageCaseItem[]).forEach((caseItem) => {
        caseItem.session_cases?.forEach((sc) => {
            const session = Array.isArray(sc.sessions) ? sc.sessions[0] : sc.sessions;
            session?.session_participants?.forEach((p) => {
                if (p.participant_id) participantIds.add(p.participant_id);
            });
        });
    });

    const uniqueIds = Array.from(participantIds);
    const juryDetailsMap: Record<string, JuryDetails> = {};

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

    // 4. Merge jury details back into the structure.
    //    Note: original runtime code spread `sc.sessions` directly even if it
    //    was an array; preserve identical behaviour by casting back to unknown
    //    and re-shaping via the same pattern.
    return (data as unknown as LineageCaseItem[]).map((caseItem) => ({
        ...caseItem,
        session_cases: caseItem.session_cases?.map((sc) => {
            const session = (Array.isArray(sc.sessions) ? sc.sessions[0] : sc.sessions) ?? undefined;
            return {
                ...sc,
                sessions: {
                    ...(session ?? {}),
                    session_participants: session?.session_participants?.map((p) => ({
                        ...p,
                        jury_participants: (p.participant_id && juryDetailsMap[p.participant_id]) || null
                    }))
                }
            };
        })
    }));
}
