/** The zone sessions are scheduled and described in: the firm and its panels are in Texas. */
export const CENTRAL_TIME_ZONE = "America/Chicago";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "9:30" / "19:30" / "19:30:00" → "09:30" / "19:30"; null for anything else. */
function hourMinute(value: string | null | undefined): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec((value ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/**
 * The instant a session time falls at. Case times are stored in session_cases as a
 * UTC time of day ("HH:MM:SS"), and sessions.session_date is the session's calendar
 * date in Central Time. An evening session is stored on the next UTC day (from
 * 7 PM CDT / 6 PM CST), so of the three nearby instants with this UTC time, this
 * takes the one that falls on the session's Central date, whatever zone the time is
 * then shown in. A full timestamp is read for its date. With no session date it
 * falls back to today.
 */
export function sessionTimeInstant(sessionDate: string | null | undefined, utcTime: string): Date {
  const date = (sessionDate || new Date().toISOString()).slice(0, 10);
  const time = hourMinute(utcTime) ?? "00:00";
  const onDate = (days: number) => new Date(Date.parse(`${date}T${time}:00Z`) + days * DAY_MS);
  const centralDate = (instant: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CENTRAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);

  const candidates = [onDate(0), onDate(1), onDate(-1)];
  return candidates.find((c) => centralDate(c) === date) ?? candidates[0];
}

/**
 * "10:00 AM": a session_cases time as a clock in a zone, on its session's date. A
 * zone's offset depends on the date, so formatting on today's date put a November
 * session an hour off whenever it was shown in October.
 */
export function formatSessionTime(
  sessionDate: string | null | undefined,
  utcTime: string,
  ianaTimezone: string
): string {
  return sessionTimeInstant(sessionDate, utcTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ianaTimezone,
  });
}

/**
 * When a session runs, from its earliest case start to its latest case end, as
 * instants. Picking them by sorting the stored UTC times as text went wrong once a
 * session crossed midnight UTC (6 PM CST / 7 PM CDT): "00:00" sorts before "23:00",
 * so the span lost its first case, or even ended before it started. An end before
 * the start belongs to the next day. Null when there is no usable start time; `end`
 * is null when there is no usable end time.
 */
export function sessionSpan(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[],
  endTimes: readonly (string | null | undefined)[]
): { start: Date; end: Date | null } | null {
  const instants = (times: readonly (string | null | undefined)[]) =>
    times
      .filter((t): t is string => hourMinute(t) !== null)
      .map((t) => sessionTimeInstant(sessionDate, t).getTime());

  const starts = instants(startTimes);
  if (!starts.length) return null;
  const start = Math.min(...starts);

  const ends = instants(endTimes).map((end) => (end < start ? end + DAY_MS : end));
  return { start: new Date(start), end: ends.length ? new Date(Math.max(...ends)) : null };
}

/** "6:00 PM – 9:00 PM": a session's span as Central clocks, or null without start and end times. */
export function formatSessionSpan(
  sessionDate: string | null | undefined,
  startTimes: readonly (string | null | undefined)[],
  endTimes: readonly (string | null | undefined)[]
): string | null {
  const span = sessionSpan(sessionDate, startTimes, endTimes);
  if (!span?.end) return null;
  const clock = (instant: Date) =>
    instant.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CENTRAL_TIME_ZONE });
  return `${clock(span.start)} – ${clock(span.end)}`;
}

/** Convert local date+time to a UTC time string "HH:MM:SS" (for storing in a time column). */
export function localToUTCTime(dateStr: string, timeStr: string, ianaTimezone: string): string {
  return localToUTC(dateStr, timeStr, ianaTimezone).split("T")[1].slice(0, 8);
}

/**
 * Convert a UTC time string "HH:MM" stored in the DB back to local "HH:MM" for display.
 * Read on the session's Central date: an evening time belongs to the next UTC day, and
 * on a clock-change Sunday that day has a different offset, which put it an hour off.
 */
export function utcTimeToLocal(sessionDate: string, utcTimeStr: string, ianaTimezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(sessionTimeInstant(sessionDate, utcTimeStr));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export function localToUTC(dateStr: string, timeStr: string, ianaTimezone: string): string {
  // Parse the date+time as if it were UTC (server runs in UTC)
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`);

  // Format that UTC instant in the target timezone to find the local offset
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(asUTC);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const inTz = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
  );

  // diffMs is the UTC offset for this timezone at this exact moment (handles DST)
  const diffMs = asUTC.getTime() - inTz.getTime();
  return new Date(asUTC.getTime() + diffMs).toISOString();
}
