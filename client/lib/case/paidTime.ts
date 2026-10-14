import { billableHours } from "@/lib/receipt-pricing";
import { CENTRAL_TIME_ZONE, calendarDate, localToUTCTime, sessionSpan } from "@/lib/timezone";

/* =========================
   PAID TIME

   A firm is billed for its case's hours: what it asked for, or 1 hour when it
   left that empty (billableHours, the receipt's rule). So in a session its case
   runs no longer than that. A booked time slot can be longer than the case: it
   says when the case can run, not for how long.

   Build Session, Reschedule and Replace Case all check it, on screen and again
   in the server action.
========================= */

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The minutes a case is paid for. */
export function paidMinutes(hoursRequested: number | null | undefined): number {
  return Math.round(billableHours(hoursRequested) * 60);
}

/** "30 minutes", "1 hour", "2 hours", "1 hour 30 minutes". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = m ? `${m} minute${m === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

/**
 * How long a case runs, in minutes, from its stored UTC times on its session's
 * Central date: an end before the start is on the next day. Null when the times
 * can't be read.
 */
export function storedCaseMinutes(
  sessionDate: string | null | undefined,
  startUtc: string | null | undefined,
  endUtc: string | null | undefined,
): number | null {
  const span = sessionSpan(sessionDate, [startUtc], [endUtc]);
  if (!span?.end) return null;
  return Math.round((span.end.getTime() - span.start.getTime()) / 60_000);
}

/** "09:00" from "09:00" or "09:00:00"; null for anything else. */
function clockOf(value: string): string | null {
  const v = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : null;
}

/**
 * How long a case runs, in minutes, from Central clock times ("HH:MM") as an
 * admin types them, measured as they will be stored. An end before the start is
 * on the next day, as the time pickers wrap past midnight; an end equal to the
 * start is 0. Null when either isn't a clock time.
 */
export function caseMinutes(sessionDate: string, start: string, end: string): number | null {
  const from = clockOf(start);
  const to = clockOf(end);
  if (!calendarDate(sessionDate) || !from || !to) return null;
  return storedCaseMinutes(
    sessionDate,
    localToUTCTime(sessionDate, from, CENTRAL_TIME_ZONE),
    localToUTCTime(sessionDate, to, CENTRAL_TIME_ZONE),
  );
}

/**
 * What's wrong with a case time, or null when it is a positive length within
 * what the case is paid for. `keepMinutes` lets a reschedule keep a length the
 * case already had (sessions built before this rule), but not make it longer.
 */
export function paidTimeProblem(
  title: string,
  minutes: number | null,
  hoursRequested: number | null | undefined,
  keepMinutes = 0,
): string | null {
  const name = `"${title}"`;
  if (minutes === null) return `The times for ${name} could not be read.`;
  if (minutes <= 0) return `${name} has to end after it starts.`;
  const paid = paidMinutes(hoursRequested);
  if (minutes > Math.max(paid, keepMinutes)) {
    return `${name} is paid for ${formatMinutes(paid)}, so it can't run ${formatMinutes(minutes)}.`;
  }
  return null;
}

/** Throws paidTimeProblem's message, for the server actions. */
export function assertPaidTime(
  title: string,
  minutes: number | null,
  hoursRequested: number | null | undefined,
  keepMinutes = 0,
): void {
  const problem = paidTimeProblem(title, minutes, hoursRequested, keepMinutes);
  if (problem) throw new Error(problem);
}

/** "HH:MM" plus some minutes, on a 24-hour clock that wraps past midnight. */
function addClockMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The end times Build Session offers for a start: every half hour up to the
 * paid length, and the paid length itself when it isn't a whole half hour.
 * Empty without a start.
 */
export function endTimeChoices(
  start: string,
  hoursRequested: number | null | undefined,
): { value: string; minutes: number }[] {
  if (!CLOCK.test(start)) return [];
  const paid = paidMinutes(hoursRequested);
  const lengths: number[] = [];
  for (let minutes = 30; minutes <= paid; minutes += 30) lengths.push(minutes);
  if (lengths[lengths.length - 1] !== paid) lengths.push(paid);
  return lengths.map((minutes) => ({ value: addClockMinutes(start, minutes), minutes }));
}
