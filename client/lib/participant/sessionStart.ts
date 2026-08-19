/* =========================
   SESSION START

   A session begins when its first case does. `session_cases.start_time` is
   stored UTC — `addCasesToSession` runs the admin's local input through
   `localToUTCTime` — so the session date plus the earliest start time is a real
   instant, not a floating wall-clock time.

   Used to close accepting once a session is under way: an invite that arrives
   mid-session can no longer be honoured. Declining stays open.
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
