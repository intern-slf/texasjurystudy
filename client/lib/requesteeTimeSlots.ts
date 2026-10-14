import { localToUTC } from "@/lib/timezone";

/**
 * Requestee time slots: times an admin opens on a calendar for law firms to book
 * a focus group (table requestee_time_slots). The firms are in Texas, so a slot
 * is entered and shown in Central Time wherever the admin happens to be.
 *
 * Nothing here touches the database, so the admin screens, the server actions
 * and the tests share it.
 */
export const SLOT_TIME_ZONE = "America/Chicago";
export const SLOT_TIME_ZONE_LABEL = "CT";
/** Also enforced by a CHECK constraint on requestee_time_slots.note. */
export const SLOT_NOTE_MAX_LENGTH = 200;
/** The most weeks one "repeat weekly" adds in one go. */
export const SLOT_MAX_WEEKS = 12;
export const TIME_SLOTS_PATH = "/dashboard/Admin/requestees/time-slots";

export type TimeSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  /**
   * In a list of open slots, the minutes still free for another case: several
   * cases can share a slot, each taking the hours its firm pays for. Absent
   * elsewhere.
   */
  minutes_left?: number;
};

export type NewTimeSlotsInput = {
  /** The first date, "YYYY-MM-DD" in Central Time. */
  date: string;
  /** "HH:MM", 24-hour, Central Time. */
  start: string;
  end: string;
  /** How many weeks in a row to add the slot, starting on `date`. 1 adds `date` only. */
  weeks: number;
  note?: string | null;
};

export type PlannedTimeSlot = Pick<TimeSlot, "starts_at" | "ends_at" | "note">;

/** The start and end choices in the add form: every half hour of the day. */
export const SLOT_TIME_OPTIONS: string[] = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const CLOCK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* =========================
   DATES AND MONTHS
   Date keys ("YYYY-MM-DD") are calendar dates with no time zone, so the
   arithmetic on them runs in UTC, where no day is ever 23 or 25 hours long.
========================= */

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A "YYYY-MM" month this century, as used in the calendar's ?month= link. */
export function isMonthKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = MONTH_KEY_RE.exec(value);
  return !!match && Number(match[1]) >= 2000 && Number(match[1]) <= 2099;
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && CLOCK_TIME_RE.test(value);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function shiftMonth(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}

/** Every date the month's calendar shows: whole weeks, Sunday to Saturday. */
export function monthGridDates(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const leadingDays = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstShown = addDays(`${monthKey}-01`, -leadingDays);
  const weeks = Math.ceil((leadingDays + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(firstShown, i));
}

/** The instants a run of Central Time dates covers: midnight on the first up to midnight after the last. */
export function datesToInstantRange(firstDate: string, lastDate: string): { from: string; to: string } {
  return {
    from: localToUTC(firstDate, "00:00", SLOT_TIME_ZONE),
    to: localToUTC(addDays(lastDate, 1), "00:00", SLOT_TIME_ZONE),
  };
}

/* =========================
   FORMATTING
   Browsers and Node disagree on the space before AM/PM (some ICU versions use a
   narrow no-break space), and the calendar is rendered on the server, then in
   the browser, so every label goes through plainSpaces.
========================= */

const plainSpaces = (text: string) => text.replace(/[  ]/g, " ");

const wallClockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SLOT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SLOT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** What a Central Time clock and calendar show at an instant: "YYYY-MM-DD" and "HH:MM". */
function wallClock(instant: string | number | Date): { date: string; time: string } {
  const parts = wallClockFormat.formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** The Central Time date an instant falls on, "YYYY-MM-DD". */
export function slotDateKey(instant: string | number | Date): string {
  return wallClock(instant).date;
}

/** "10:00 AM – 12:00 PM", in Central Time. */
export function formatSlotRange(slot: Pick<TimeSlot, "starts_at" | "ends_at">): string {
  return plainSpaces(
    `${clockFormat.format(new Date(slot.starts_at))} – ${clockFormat.format(new Date(slot.ends_at))}`
  );
}

/** "Tue, Oct 21" by default. Formatted in UTC because a date key has no time of day to shift. */
export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return plainSpaces(
    new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)))
  );
}

/** "October 2026". */
export function formatMonthKey(monthKey: string): string {
  return formatDateKey(`${monthKey}-01`, { month: "long", year: "numeric" });
}

/** "14:30" to "2:30 PM". */
export function formatClockTime(clockTime: string): string {
  const [h, m] = clockTime.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Tue, Oct 21, 10:00 AM – 12:00 PM CT", for messages that name one slot. */
export function describeSlot(slot: Pick<TimeSlot, "starts_at" | "ends_at">): string {
  return `${formatDateKey(slotDateKey(slot.starts_at))}, ${formatSlotRange(slot)} ${SLOT_TIME_ZONE_LABEL}`;
}

/* =========================
   ADDING SLOTS
========================= */

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

/**
 * Checks what the admin entered and works out the slots to save, one per week.
 * The input comes from a server action, which anyone signed in can call with
 * anything, so every field is checked here and not only in the form.
 */
export function planTimeSlots(
  input: NewTimeSlotsInput,
  nowMs: number
): { ok: true; slots: PlannedTimeSlot[] } | Failure {
  if (!isDateKey(input?.date)) return fail("Pick a valid date.");
  if (!isClockTime(input.start) || !isClockTime(input.end)) return fail("Pick a start and an end time.");
  if (input.end <= input.start) return fail("The end time has to be after the start time.");
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > SLOT_MAX_WEEKS) {
    return fail(`Repeat for between 1 and ${SLOT_MAX_WEEKS} weeks.`);
  }
  if (input.note != null && typeof input.note !== "string") return fail("The note has to be text.");

  const note = input.note?.trim() || null;
  if (note && note.length > SLOT_NOTE_MAX_LENGTH) {
    return fail(`Keep the note to ${SLOT_NOTE_MAX_LENGTH} characters.`);
  }

  const slots: PlannedTimeSlot[] = [];
  for (let week = 0; week < input.weeks; week++) {
    const date = addDays(input.date, 7 * week);
    const slot = {
      starts_at: localToUTC(date, input.start, SLOT_TIME_ZONE),
      ends_at: localToUTC(date, input.end, SLOT_TIME_ZONE),
      note,
    };
    // The hour skipped when clocks go forward doesn't exist, and converting a
    // time inside it lands on a different time, so check each one comes back
    // as entered.
    for (const [time, instant] of [
      [input.start, slot.starts_at],
      [input.end, slot.ends_at],
    ]) {
      const shown = wallClock(instant);
      if (shown.date !== date || shown.time !== time) {
        return fail(
          `There is no ${formatClockTime(time)} on ${formatDateKey(date)}: the clocks go forward that night. Pick another time.`
        );
      }
    }
    slots.push(slot);
  }

  if (Date.parse(slots[0].starts_at) <= nowMs) {
    return fail("That time has already passed. Pick a later one.");
  }

  return { ok: true, slots };
}

/**
 * The first existing slot that overlaps one of the new ones, if any. Slots that
 * only touch (one ends at 12:00, the next starts at 12:00) don't overlap.
 */
export function findOverlappingSlot<T extends Pick<TimeSlot, "starts_at" | "ends_at">>(
  planned: PlannedTimeSlot[],
  existing: T[]
): T | null {
  for (const slot of planned) {
    const start = Date.parse(slot.starts_at);
    const end = Date.parse(slot.ends_at);
    const clash = existing.find((e) => Date.parse(e.starts_at) < end && start < Date.parse(e.ends_at));
    if (clash) return clash;
  }
  return null;
}
