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

   Every instant here is built with an explicit `Z`. Omitting it makes
   `new Date("2026-08-22T22:30:00")` parse in the *server's* local zone, which
   silently agrees with UTC on a UTC host and drifts by the offset anywhere else.
========================= */

/** "19:30" / "19:30:00" → "19:30:00". Null for anything unparseable. */
function normalizeTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, hour, minute, second] = m;
  return `${hour.padStart(2, "0")}:${minute}:${second ?? "00"}`;
}

/**
 * The UTC instant a session begins, or null when there is no usable date.
 *
 * A session with no case times falls back to midnight UTC on its date: it cannot
 * be run without cases, so once the day arrives the invite is no longer live.
 */
export function sessionStartInstant(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
): Date | null {
  if (!sessionDate) return null;

  const day = sessionDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const earliest = startTimes
    .filter((t): t is string => Boolean(t))
    .map(normalizeTime)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(0);

  const instant = new Date(`${day}T${earliest ?? "00:00:00"}Z`);
  return Number.isNaN(instant.getTime()) ? null : instant;
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
 * The UTC instant a session finishes — its latest case end.
 *
 * A case ending "before" the session's first start ran past midnight, so it is
 * rolled onto the next day before the latest end is picked. Taking the plain
 * maximum would read a 19:30→22:30 plus 22:30→00:30 session as ending at 22:30.
 */
export function sessionEndInstant(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[] = [],
  endTimes: readonly (string | null | undefined)[] = [],
): Date | null {
  const start = sessionStartInstant(sessionDate, startTimes);
  if (!start) return null;

  const day = (sessionDate ?? "").slice(0, 10);
  const ends = endTimes
    .filter((t): t is string => Boolean(t))
    .map(normalizeTime)
    .filter((t): t is string => Boolean(t))
    .map((t) => {
      const instant = new Date(`${day}T${t}Z`);
      // Ends before the session even started ⇒ it belongs to the next day.
      return instant.getTime() < start.getTime()
        ? new Date(instant.getTime() + 24 * 60 * 60 * 1000)
        : instant;
    })
    .filter((d) => !Number.isNaN(d.getTime()));

  if (!ends.length) return start;
  return new Date(Math.max(...ends.map((d) => d.getTime())));
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
