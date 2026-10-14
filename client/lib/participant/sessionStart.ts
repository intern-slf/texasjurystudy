import { CENTRAL_TIME_ZONE, calendarDate, localToUTC, sessionSpan } from "@/lib/timezone";

/* =========================
   SESSION TIMING

   A session begins when its first case does and ends when its last one does.
   `session_cases.start_time` / `end_time` are stored UTC — `addCasesToSession`
   runs the admin's local input through `localToUTCTime` — so the session date
   plus a case time is a real instant, not a floating wall-clock time.

   Two things depend on that:
     * accepting closes once a session is under way (`hasSessionStarted`)
     * accepting a seat puts the participant on cooldown until the day after the
       session ends (`cooldownAfterSession`)

   The session date is a Central calendar date, and an evening session's UTC
   times fall on the next UTC day (from 7 PM CDT / 6 PM CST). So a time is never
   read as "session date + time Z": sessionSpan in lib/timezone.ts finds the
   instant on the session's Central date. Reading it the plain way closed an
   evening session's invitations a day early, and ended its cooldown a day early.
========================= */

/**
 * The instant a session begins, or null when there is no usable date.
 *
 * A session with no case times falls back to the start of its Central date: it
 * cannot be run without cases, so once the day arrives the invite is no longer
 * live. (Midnight UTC was 7 PM the evening before.)
 */
export function sessionStartInstant(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
): Date | null {
  const day = calendarDate(sessionDate);
  if (!day) return null;
  return sessionSpan(day, startTimes, [])?.start ?? new Date(localToUTC(day, "00:00", CENTRAL_TIME_ZONE));
}

/**
 * True once the session's first case has begun. An unknown or unparseable date
 * returns false — better to let the response through than to block on a row we
 * cannot read.
 */
export function hasSessionStarted(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
  now: Date = new Date(),
): boolean {
  const start = sessionStartInstant(sessionDate, startTimes);
  return start !== null && now.getTime() >= start.getTime();
}

/**
 * The instant a session finishes: its latest case end, or its start when no case
 * has an end time. Null when there is no usable date.
 */
export function sessionEndInstant(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
  endTimes: readonly (string | null | undefined)[] = [],
): Date | null {
  const day = calendarDate(sessionDate);
  if (!day) return null;
  return sessionSpan(day, startTimes, endTimes)?.end ?? sessionStartInstant(day, startTimes);
}

/**
 * When a participant who took a seat becomes eligible again: the day after the
 * session ends. Returned as an ISO string for `jury_participants.eligible_after_at`,
 * or null when the session times cannot be read (leave the cooldown alone).
 *
 * Adds 24h to the instant rather than bumping the calendar day, because
 * `Date.setDate` works in the server's local zone and would shift the result on
 * a non-UTC host.
 */
export function cooldownAfterSession(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
  endTimes: readonly (string | null | undefined)[] = [],
): string | null {
  const end = sessionEndInstant(sessionDate, startTimes, endTimes);
  if (!end) return null;
  return new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
}
