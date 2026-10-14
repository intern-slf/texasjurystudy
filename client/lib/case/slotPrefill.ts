import { paidMinutes } from "@/lib/case/paidTime";
import { slotDateKey, type TimeSlot } from "@/lib/requesteeTimeSlots";
import { centralDateTimeInput } from "@/lib/timezone";

/** A case picked for a new session, and the slot it booked, if any. */
export type BookedCase = {
  caseId: string;
  hoursRequested: number | null | undefined;
  /** When the firm started holding its time: earlier bookings go first. */
  heldSince: string | null | undefined;
  slot: TimeSlot | null | undefined;
};

export type SessionPrefill = {
  /** The slot the session is built in. */
  slot: TimeSlot;
  /** Its Central date, "YYYY-MM-DD", for the session date. */
  date: string;
  /** Each case booked in it: its start, "HH:MM" Central, one after another from the slot's start. */
  starts: Record<string, string>;
  /** Other slots some of the cases booked, which nothing is filled in from. */
  otherSlots: TimeSlot[];
};

/**
 * Build Session's starting point from the time slots its cases booked. A slot
 * is sold by the hour to several firms, so its cases make one session: the
 * session takes the slot's date, and the cases booked in it start one after
 * another from its start, earliest booking first, each for the hours its firm
 * pays for. The admin can change any of it.
 *
 * The slot is `preferredSlotId` (the calendar's Build session link) when one
 * of the cases booked it; otherwise the one most of them booked, then the
 * earliest. Null when none of the cases holds a slot.
 */
export function sessionPrefill(cases: BookedCase[], preferredSlotId?: string | null): SessionPrefill | null {
  const slots = new Map<string, { slot: TimeSlot; cases: BookedCase[] }>();
  for (const c of cases) {
    if (!c.slot) continue;
    const entry = slots.get(c.slot.id) ?? { slot: c.slot, cases: [] };
    entry.cases.push(c);
    slots.set(c.slot.id, entry);
  }
  if (!slots.size) return null;

  const chosen =
    (preferredSlotId && slots.get(preferredSlotId)) ||
    Array.from(slots.values()).sort(
      (a, b) => b.cases.length - a.cases.length || a.slot.starts_at.localeCompare(b.slot.starts_at),
    )[0];

  const inOrder = [...chosen.cases].sort(
    (a, b) =>
      (a.heldSince ?? "\uffff").localeCompare(b.heldSince ?? "\uffff") || a.caseId.localeCompare(b.caseId),
  );
  const starts: Record<string, string> = {};
  let offset = 0;
  for (const c of inOrder) {
    const start = new Date(Date.parse(chosen.slot.starts_at) + offset * 60_000).toISOString();
    starts[c.caseId] = centralDateTimeInput(start).slice(11, 16);
    offset += paidMinutes(c.hoursRequested);
  }

  return {
    slot: chosen.slot,
    date: slotDateKey(chosen.slot.starts_at),
    starts,
    otherSlots: Array.from(slots.values())
      .filter((s) => s !== chosen)
      .map((s) => s.slot),
  };
}
