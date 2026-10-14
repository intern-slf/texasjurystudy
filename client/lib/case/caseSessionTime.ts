import { calendarDate, formatSessionSpan, sessionSpan } from "@/lib/timezone";

/** A `session_cases` row as embedded on a case: the case's times and its session's date. */
export type CaseSessionRow = {
  start_time?: string | null;
  end_time?: string | null;
  sessions?: { session_date?: string | null } | { session_date?: string | null }[] | null;
};

export type CaseSessionTime = {
  /** The session's Central date, "YYYY-MM-DD". */
  sessionDate: string;
  /** When the case starts. */
  start: Date;
  /** When the case ends, or null without a usable end time. */
  end: Date | null;
  /** "10:00 AM – 11:00 AM CT", or null without a usable end time. */
  time: string | null;
};

/**
 * When a case runs in its session: the case's own start and end, on the
 * session's date. Once a case is in a session, cases.admin_scheduled_at holds
 * the time it ENDS (the firm's dashboard moves it to Past once that has gone
 * by), so showing that column as "the session" gave firms and admins the end
 * time as the start, in no stated zone. With more than one session, the
 * latest-dated one. Null when no row has a session date and a start time.
 */
export function caseSessionTime(rows: readonly CaseSessionRow[] | null | undefined): CaseSessionTime | null {
  let best: CaseSessionTime | null = null;
  for (const row of rows ?? []) {
    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    const sessionDate = calendarDate(session?.session_date);
    if (!sessionDate) continue;
    const span = sessionSpan(sessionDate, [row.start_time], [row.end_time]);
    if (!span) continue;
    if (best && best.sessionDate >= sessionDate) continue;
    const time = formatSessionSpan(sessionDate, [row.start_time], [row.end_time]);
    best = { sessionDate, start: span.start, end: span.end, time: time ? `${time} CT` : null };
  }
  return best;
}
