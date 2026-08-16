import { createClient } from "@/lib/supabase/server";

/**
 * Every session scheduled for a case, with the participant roster attached.
 *
 * Reads through the caller's own client so RLS still applies — admins have a
 * FOR ALL policy on `sessions`/`session_participants`, and requestees are scoped
 * to their own cases, so this is safe to render on either side.
 */

export type CaseSessionParticipant = {
  /** `session_participants.participant_id` — an auth user id, or an `oldData.id` for legacy rows. */
  id: string;
  name: string;
  email: string;
  inviteStatus: string;
  respondedAt: string | null;
};

export type CaseSessionRow = {
  sessionId: string;
  date: string;
  displayDate: string;
  /** Raw UTC `time` values from `session_cases` — rendered client-side in the viewer's timezone. */
  startTime: string | null;
  endTime: string | null;
  zoomLink: string | null;
  participantCap: number;
  isPast: boolean;
  participants: CaseSessionParticipant[];
  acceptedCount: number;
};

/** A real response beats a stale pending row when a participant appears twice on one session. */
function statusRank(status: string | null): number {
  if (status === "accepted") return 3;
  if (status === "declined") return 2;
  return 1;
}

export async function getCaseSessions(caseId: string): Promise<CaseSessionRow[]> {
  const supabase = await createClient();

  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("session_id, start_time, end_time")
    .eq("case_id", caseId);

  const sessionIds = Array.from(
    new Set((sessionCases ?? []).map((sc) => sc.session_id).filter(Boolean))
  ) as string[];

  if (!sessionIds.length) return [];

  const [{ data: sessions }, { data: invites }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, session_date, zoom_link, participant_cap")
      .in("id", sessionIds),
    supabase
      .from("session_participants")
      .select("session_id, participant_id, invite_status, responded_at")
      .in("session_id", sessionIds),
  ]);

  /* =========================
     PARTICIPANT NAMES
     ========================= */
  const participantIds = Array.from(
    new Set((invites ?? []).map((i) => i.participant_id).filter(Boolean))
  ) as string[];

  const details: Record<string, { name: string; email: string }> = {};
  if (participantIds.length) {
    const { data: jury } = await supabase
      .from("jury_participants")
      .select("user_id, first_name, last_name, email")
      .in("user_id", participantIds);

    for (const j of jury ?? []) {
      details[j.user_id] = {
        name: `${j.first_name ?? ""} ${j.last_name ?? ""}`.trim() || "Unnamed participant",
        email: j.email ?? "",
      };
    }

    // Legacy rows live in `oldData`, keyed by `id` rather than `user_id`.
    const missing = participantIds.filter((id) => !details[id]);
    if (missing.length) {
      const { data: old } = await supabase
        .from("oldData")
        .select("id, first_name, last_name, email")
        .in("id", missing);

      for (const o of old ?? []) {
        details[o.id] = {
          name: `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "Unnamed participant",
          email: o.email ?? "",
        };
      }
    }
  }

  /* =========================
     ROSTER PER SESSION
     ========================= */
  const rosterBySession = new Map<string, Map<string, CaseSessionParticipant>>();
  for (const inv of invites ?? []) {
    if (!inv.session_id || !inv.participant_id) continue;

    let roster = rosterBySession.get(inv.session_id);
    if (!roster) {
      roster = new Map();
      rosterBySession.set(inv.session_id, roster);
    }

    const existing = roster.get(inv.participant_id);
    if (existing && statusRank(existing.inviteStatus) >= statusRank(inv.invite_status)) continue;

    roster.set(inv.participant_id, {
      id: inv.participant_id,
      name: details[inv.participant_id]?.name ?? "Unknown participant",
      email: details[inv.participant_id]?.email ?? "",
      inviteStatus: inv.invite_status ?? "pending",
      respondedAt: inv.responded_at ?? null,
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Times live on session_cases (per case), so pull this case's slot for each session.
  const timesBySession = new Map<string, { start: string | null; end: string | null }>();
  for (const sc of sessionCases ?? []) {
    if (!sc.session_id) continue;
    timesBySession.set(sc.session_id, { start: sc.start_time ?? null, end: sc.end_time ?? null });
  }

  return (sessions ?? [])
    .map((s) => {
      const roster = Array.from(rosterBySession.get(s.id)?.values() ?? []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const times = timesBySession.get(s.id);

      return {
        sessionId: s.id,
        date: s.session_date,
        displayDate: new Date(s.session_date).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        startTime: times?.start ?? null,
        endTime: times?.end ?? null,
        zoomLink: s.zoom_link ?? null,
        participantCap: s.participant_cap ?? 10,
        isPast: new Date(s.session_date) < today,
        participants: roster,
        acceptedCount: roster.filter((p) => p.inviteStatus === "accepted").length,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
