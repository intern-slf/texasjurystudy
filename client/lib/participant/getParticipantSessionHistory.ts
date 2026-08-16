import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Every session a participant was ever invited to, with the case(s) that ran in
 * it and how they responded. Admin-only: this crosses case boundaries, so a
 * requestee must never see it.
 *
 * Reads through `supabaseAdmin` (same reason the other admin reads do — the
 * joins span `sessions`/`session_cases`/`cases`), so the caller's admin role is
 * verified here rather than trusted from the page.
 */

export type ParticipantSessionCase = {
  id: string | null;
  title: string;
};

export type ParticipantSessionRow = {
  sessionId: string;
  date: string;
  displayDate: string;
  timeRange: string;
  /** Raw `session_participants.invite_status` — "accepted" | "declined" | "pending" | null. */
  inviteStatus: string;
  respondedAt: string | null;
  isPast: boolean;
  cases: ParticipantSessionCase[];
};

export type ParticipantSessionStats = {
  invited: number;
  attended: number;
  upcoming: number;
  declined: number;
  noResponse: number;
  lastAttendedDate: string | null;
};

export type ParticipantSessionHistory = {
  past: ParticipantSessionRow[];
  upcoming: ParticipantSessionRow[];
  stats: ParticipantSessionStats;
};

type SessionCaseRow = {
  start_time?: string | null;
  end_time?: string | null;
  cases?: { id?: string | null; title?: string | null } | { id?: string | null; title?: string | null }[] | null;
};

type SessionRow = {
  session_date?: string | null;
  session_cases?: SessionCaseRow[] | null;
};

type InviteRow = {
  session_id: string | null;
  invite_status: string | null;
  responded_at: string | null;
  sessions?: SessionRow | SessionRow[] | null;
};

/** Times are stored as naive `time` values entered in Central — same conversion the participant + email paths use. */
function fmtCt(t: string): string {
  const [h, m] = t.split(":");
  const d = new Date();
  d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

/** Rank used when the same participant has more than one row for a session — a real response beats a stale pending row. */
function statusRank(status: string | null): number {
  if (status === "accepted") return 3;
  if (status === "declined") return 2;
  return 1;
}

export async function getParticipantSessionHistory(
  participantIds: string[]
): Promise<ParticipantSessionHistory | null> {
  const ids = Array.from(new Set(participantIds.filter(Boolean)));
  if (!ids.length) return null;

  /* =========================
     CALLER MUST BE ADMIN
     ========================= */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if ((roleRow?.role || user.user_metadata?.role) !== "admin") return null;

  /* =========================
     FETCH INVITES + SESSIONS
     ========================= */
  const { data: invites, error } = await supabaseAdmin
    .from("session_participants")
    .select(
      "session_id, invite_status, responded_at, sessions(session_date, session_cases(start_time, end_time, cases(id, title)))"
    )
    .in("participant_id", ids);

  if (error) {
    console.error("[getParticipantSessionHistory] Failed to read invites:", error.message);
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Same session can appear twice (re-invites) — keep the strongest response.
  const bySession = new Map<string, ParticipantSessionRow>();

  for (const inv of (invites ?? []) as InviteRow[]) {
    const sessionId = inv.session_id;
    if (!sessionId) continue;

    const session = (Array.isArray(inv.sessions) ? inv.sessions[0] : inv.sessions) ?? null;
    const date = session?.session_date ?? "";
    if (!date) continue;

    const sessionCases: SessionCaseRow[] = session?.session_cases ?? [];
    const starts = sessionCases.map((c) => c.start_time).filter((v): v is string => Boolean(v)).sort();
    const ends = sessionCases.map((c) => c.end_time).filter((v): v is string => Boolean(v)).sort();

    const cases: ParticipantSessionCase[] = [];
    const seenCaseIds = new Set<string>();
    for (const sc of sessionCases) {
      const detail = Array.isArray(sc.cases) ? sc.cases[0] : sc.cases;
      if (!detail) continue;
      const key = detail.id ?? detail.title ?? "";
      if (!key || seenCaseIds.has(key)) continue;
      seenCaseIds.add(key);
      cases.push({ id: detail.id ?? null, title: detail.title ?? "Untitled case" });
    }

    const row: ParticipantSessionRow = {
      sessionId,
      date,
      displayDate: new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      timeRange:
        starts.length && ends.length
          ? `${fmtCt(starts[0])} – ${fmtCt(ends[ends.length - 1])} CT`
          : "Time TBD",
      inviteStatus: inv.invite_status ?? "pending",
      respondedAt: inv.responded_at ?? null,
      isPast: new Date(date) < today,
      cases,
    };

    const existing = bySession.get(sessionId);
    if (!existing || statusRank(row.inviteStatus) > statusRank(existing.inviteStatus)) {
      bySession.set(sessionId, row);
    }
  }

  const all = Array.from(bySession.values());

  const past = all
    .filter((s) => s.isPast)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const upcoming = all
    .filter((s) => !s.isPast)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const attendedRows = past.filter((s) => s.inviteStatus === "accepted");

  return {
    past,
    upcoming,
    stats: {
      invited: all.length,
      attended: attendedRows.length,
      upcoming: upcoming.filter((s) => s.inviteStatus === "accepted").length,
      declined: all.filter((s) => s.inviteStatus === "declined").length,
      noResponse: past.filter(
        (s) => s.inviteStatus !== "accepted" && s.inviteStatus !== "declined"
      ).length,
      lastAttendedDate: attendedRows[0]?.displayDate ?? null,
    },
  };
}
