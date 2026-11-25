import { localToUTC } from "@/lib/timezone";
import { billableHours } from "@/lib/receipt-pricing";
import { formatMinutes } from "@/lib/case/paidTime";
import {
  SLOT_TIME_ZONE,
  SLOT_TIME_ZONE_LABEL,
  addDays,
  formatDateKey,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";

/**
 * The rules for a law firm's booking of a time slot (requestee_slot_bookings).
 * Nothing here touches the database, so the server actions, the screens and the
 * tests share them.
 *
 * Payment is due by the end of the day the case runs (paymentDueAt): nothing
 * is owed before it's scheduled, by a held slot or a session.
 *
 * The booking lead counts working hours: Monday to Friday on the Central Time
 * clock, so a slot booked on Friday afternoon must start after Tuesday
 * afternoon. US holidays count as working days.
 */

/**
 * A firm can only book a slot starting at least this many working hours ahead,
 * so the admin has time to build the session and invite participants.
 */
export const BOOKING_LEAD_WORKING_HOURS = 48;

export type SlotBookingRow = {
  case_id: string;
  slot_id: string | null;
  booked_by: string | null;
  held_since: string | null;
  paid_at: string | null;
};

/** open: nobody holds it. overdue: held, unpaid, and the end of its day has gone by. */
export type BookingState = "open" | "unpaid" | "overdue" | "paid";

/** What the admin screens show about one booked slot. */
export type BookingView = {
  caseId: string;
  slotId: string;
  /** How long the case is, which is how much of the slot it takes (lib/case/paidTime.ts). */
  minutes: number;
  caseTitle: string;
  firm: string;
  state: Exclude<BookingState, "open">;
  paidAt: string | null;
  /** When payment is (or was) due: the end of the slot's day. */
  dueAt: string | null;
  /** Things the admin should look at: a rejected or archived case, a slot shorter than the case needs. */
  warnings: string[];
  /** Approved (or submitted), so it can go into a session. */
  approved: boolean;
  /** The session the case is in, once one is built; the Time Slots page fills it in. */
  session?: {
    id: string;
    date: string;
    time: string | null;
    outsideSlot: boolean;
    /** Its participants have been invited, which closes the slot to firms. */
    invited: boolean;
  } | null;
};

export const BOOKING_STATE_LABEL: Record<BookingState, string> = {
  open: "Open",
  unpaid: "Unpaid",
  overdue: "Payment overdue",
  paid: "Paid",
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const wallClockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SLOT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The Central Time date of an instant, and how far into that day it is. */
function centralWallClock(instantMs: number): { date: string; msOfDay: number } {
  const parts = wallClockFormat.formatToParts(new Date(instantMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const subSecondMs = ((instantMs % 1000) + 1000) % 1000;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    msOfDay:
      ((Number(get("hour")) * 60 + Number(get("minute"))) * 60 + Number(get("second"))) * 1000 + subSecondMs,
  };
}

/** The instant a Central Time clock shows `msOfDay` into `date`. */
function fromCentralWallClock(date: string, msOfDay: number): Date {
  if (msOfDay >= MS_PER_DAY) return fromCentralWallClock(addDays(date, 1), msOfDay - MS_PER_DAY);
  const minutes = Math.floor(msOfDay / 60_000);
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return new Date(Date.parse(localToUTC(date, clock, SLOT_TIME_ZONE)) + (msOfDay % 60_000));
}

function isWeekend(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** `hours` later, counting only Monday to Friday on the Central Time clock. */
export function addWorkingHours(from: string | number | Date, hours: number): Date {
  let { date, msOfDay } = centralWallClock(new Date(from).getTime());
  let remaining = hours * MS_PER_HOUR;

  while (isWeekend(date)) {
    date = addDays(date, 1);
    msOfDay = 0;
  }

  while (remaining > MS_PER_DAY - msOfDay) {
    remaining -= MS_PER_DAY - msOfDay;
    do {
      date = addDays(date, 1);
    } while (isWeekend(date));
    msOfDay = 0;
  }

  return fromCentralWallClock(date, msOfDay + remaining);
}

/**
 * When payment is due: 11:59 PM Central on the day the case runs. That's the
 * day of its session once it's in one, else the day of the slot its firm
 * holds. Null while it has neither: it isn't scheduled, so nothing is owed yet.
 */
export function paymentDueAt({
  slot,
  sessionDate,
}: {
  slot?: Pick<TimeSlot, "starts_at"> | null;
  sessionDate?: string | null;
}): Date | null {
  const day = sessionDate || (slot ? slotDateKey(slot.starts_at) : null);
  return day ? fromCentralWallClock(day, MS_PER_DAY - 60_000) : null;
}

export function earliestBookableStart(now: string | number | Date): Date {
  return addWorkingHours(now, BOOKING_LEAD_WORKING_HOURS);
}

/** How long a slot is, in minutes. */
export function slotMinutes(slot: Pick<TimeSlot, "starts_at" | "ends_at">): number {
  return Math.round((Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60_000);
}

/**
 * Whether a case needing `hoursRequested` fits in a slot: in the minutes it has
 * left when that is known (other cases share it), else in its whole length.
 */
export function slotFitsHours(
  slot: Pick<TimeSlot, "starts_at" | "ends_at" | "minutes_left">,
  hoursRequested: number | null | undefined
): boolean {
  const room = slot.minutes_left ?? slotMinutes(slot);
  return room >= billableHours(hoursRequested) * 60;
}

/** Whether a case's session time falls outside the slot it booked, even partly. */
export function isOutsideSlot(start: Date, end: Date | null, slot: Pick<TimeSlot, "starts_at" | "ends_at">): boolean {
  return start.getTime() < Date.parse(slot.starts_at) || (end ?? start).getTime() > Date.parse(slot.ends_at);
}

/** "2 of 3 hours left", or null while nothing in the slot is booked. */
export function hoursLeftLabel(slot: Pick<TimeSlot, "starts_at" | "ends_at" | "minutes_left">): string | null {
  const total = slotMinutes(slot);
  const left = slot.minutes_left;
  if (left === undefined || left >= total) return null;
  return `${formatMinutes(Math.max(left, 0)).replace(/ hours?$/, "")} of ${formatMinutes(total)} left`;
}

/**
 * The database's refusal of a booking that would take a slot past its hours, or
 * a booked case's hours past what its slot has left (20261017_shared_slot_hours.sql).
 */
export function isSlotFullError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23514" && (error.message ?? "").startsWith("requestee_slot_full");
}

/** Whether a firm may book this slot now for a case needing `hoursRequested`. */
export function isSlotBookable(
  slot: Pick<TimeSlot, "starts_at" | "ends_at">,
  hoursRequested: number | null | undefined,
  nowMs: number
): boolean {
  return (
    Date.parse(slot.starts_at) >= earliestBookableStart(nowMs).getTime() &&
    slotFitsHours(slot, hoursRequested)
  );
}

export function bookingState(
  slot: Pick<TimeSlot, "starts_at">,
  booking: Pick<SlotBookingRow, "held_since" | "paid_at"> | null | undefined,
  nowMs: number
): BookingState {
  if (!booking) return "open";
  if (booking.paid_at) return "paid";
  if (nowMs >= paymentDueAt({ slot })!.getTime()) return "overdue";
  return "unpaid";
}

/**
 * "Mon, Oct 19, 3:00 PM CT", or "end of Mon, Oct 19" for a deadline at midnight
 * (a hold that started at the weekend), which reads better than 12:00 AM.
 */
export function formatDeadline(instant: string | number | Date): string {
  const { date, msOfDay } = centralWallClock(new Date(instant).getTime());
  if (msOfDay === 0) return `end of ${formatDateKey(addDays(date, -1))}`;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: SLOT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(instant))
    .replace(/[  ]/g, " ");
  return `${formatDateKey(date)}, ${time} ${SLOT_TIME_ZONE_LABEL}`;
}

/** The firm's name: the confirmed name on its agreement, else its email, else a placeholder. */
export function firmLabel(name: string | null | undefined, email: string | null | undefined): string {
  return name?.trim() || email?.trim() || "A law firm";
}
