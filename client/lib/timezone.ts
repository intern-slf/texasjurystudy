/** The zone sessions are scheduled and described in: the firm and its panels are in Texas. */
export const CENTRAL_TIME_ZONE = "America/Chicago";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * "9:30" / "19:30" / "19:30:00" → "09:30" / "19:30"; null for anything else. A time
 * column also allows 24:00, the next midnight: the same UTC time of day as 00:00, so
 * the instant search below puts it on the right day.
 */
function hourMinute(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (/^24:00(:00)?$/.test(v)) return "00:00";
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(v);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** The "YYYY-MM-DD" a date or timestamp string starts with, or null when that isn't a real date. */
export function calendarDate(value: string | null | undefined): string | null {
  const day = (value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Date.parse rolls an impossible day over (Feb 30 is Mar 2), so check it comes back unchanged.
  const ms = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(day) ? day : null;
}

/** One date formatter per zone: they are slow to build, and every time read tries up to three instants. */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** "YYYY-MM-DD" of an instant in a zone. */
function dateInZone(instant: Date, ianaTimezone: string): string {
  let format = dateFormats.get(ianaTimezone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: ianaTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormats.set(ianaTimezone, format);
  }
  return format.format(instant);
}

/** Of the three nearby instants with this UTC time of day, the one on `date` in the zone. */
function instantOnDate(date: string, utcTime: string, ianaTimezone: string): Date {
  const time = hourMinute(utcTime) ?? "00:00";
  const onDate = (days: number) => new Date(Date.parse(`${date}T${time}:00Z`) + days * DAY_MS);
  const candidates = [onDate(0), onDate(1), onDate(-1)];
  return candidates.find((c) => dateInZone(c, ianaTimezone) === date) ?? candidates[0];
}

/** Today's UTC date, for a time read without a usable session date. */
const utcToday = () => new Date().toISOString().slice(0, 10);

/**
 * The instant a session time falls at. Case times are stored in session_cases as a
 * UTC time of day ("HH:MM:SS"), and sessions.session_date is the session's calendar
 * date in Central Time. An evening session is stored on the next UTC day (from
 * 7 PM CDT / 6 PM CST), so this takes the instant with that UTC time that falls on
 * the session's Central date, whatever zone it is then shown in. A full timestamp is
 * read for its date. Without a usable session date it falls back to today.
 */
export function sessionTimeInstant(sessionDate: string | null | undefined, utcTime: string): Date {
  return instantOnDate(calendarDate(sessionDate) ?? utcToday(), utcTime, CENTRAL_TIME_ZONE);
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
 * so the span lost its first case, or even ended before it started.
 *
 * A stored time of day can't say which midnight it follows, and the session's date
 * reads one after Central midnight as the early morning of that same day. So an end
 * before the start belongs to the next day, and so does a start more than 18 hours
 * before the session's latest one: a case after midnight following an evening one
 * (or 11 PM on the night the clocks go back, which reads as 12 AM CDT that morning).
 * The cases of a real one-day session are never that far apart.
 *
 * Null when there is no usable start time; `end` is null when there is no usable
 * end time.
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

  const read = instants(startTimes);
  if (!read.length) return null;
  const latest = Math.max(...read);
  const starts = read.map((s) => (latest - s > 18 * HOUR_MS ? s + DAY_MS : s));
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
 * Convert a UTC time string "HH:MM" stored in the DB back to local "HH:MM", for the
 * admin's session times and the Reschedule form's inputs. rescheduleSession saves
 * those inputs back onto the session's date in the same zone, so the time is read as
 * the instant on the session's date in that zone, and saving the form unchanged
 * stores the same time. In Central Time that is the session's real instant: an
 * evening time belongs to the next UTC day, whose offset differs on a clock-change
 * Sunday, and reading it on the session's own UTC date put it an hour off.
 */
export function utcTimeToLocal(sessionDate: string, utcTimeStr: string, ianaTimezone: string): string {
  const date = calendarDate(sessionDate) ?? utcToday();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instantOnDate(date, utcTimeStr, ianaTimezone));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms (negative in the US). */
function zoneOffsetMs(instantMs: number, ianaTimezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const wallClockMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallClockMs - instantMs;
}

export function localToUTC(dateStr: string, timeStr: string, ianaTimezone: string): string {
  // Parse the date+time as if it were UTC (server runs in UTC)
  const wallClockMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();

  // The offset has to be the one in force at the answer, which we don't have
  // yet. Measuring it at the wall-clock time read as UTC is a few hours off, and
  // on the day clocks change that can land on the other side of the change: in
  // Central Time, 3:00 AM on the November changeover came out as 2:00 AM. So
  // take a first guess, then measure the offset again at the guess.
  const guessMs = wallClockMs - zoneOffsetMs(wallClockMs, ianaTimezone);
  return new Date(wallClockMs - zoneOffsetMs(guessMs, ianaTimezone)).toISOString();
}
