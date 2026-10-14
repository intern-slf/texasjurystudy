import { describe, it, expect } from "vitest";
import {
  addWorkingHours,
  bookingState,
  earliestBookableStart,
  firmLabel,
  formatDeadline,
  isSlotBookable,
  paymentDueAt,
  slotFitsHours,
} from "@/lib/slotBooking";
import { billableHours } from "@/lib/receipt-pricing";

// October 2026 is Central Daylight Time (UTC-5): 15:00 CT is 20:00 UTC.
const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

describe("payment deadline: 24 working hours, Monday to Friday on the Central clock", () => {
  it.each([
    ["Mon 9:00 → Tue 9:00", ct("2026-10-19", "09:00"), ct("2026-10-20", "09:00")],
    ["Tue 15:00 → Wed 15:00", ct("2026-10-20", "15:00"), ct("2026-10-21", "15:00")],
    ["Thu 15:00 → Fri 15:00", ct("2026-10-22", "15:00"), ct("2026-10-23", "15:00")],
    ["Fri 15:00 → Mon 15:00", ct("2026-10-23", "15:00"), ct("2026-10-26", "15:00")],
    ["Fri 23:30 → Mon 23:30", ct("2026-10-23", "23:30"), ct("2026-10-26", "23:30")],
    ["Sat 10:00 → end of Monday", ct("2026-10-24", "10:00"), ct("2026-10-27", "00:00")],
    ["Sun 23:59 → end of Monday", ct("2026-10-25", "23:59"), ct("2026-10-27", "00:00")],
    ["Mon 00:00 → Tue 00:00", ct("2026-10-19", "00:00"), ct("2026-10-20", "00:00")],
  ])("%s", (_label, heldSince, due) => {
    expect(paymentDueAt(heldSince).toISOString()).toBe(new Date(due).toISOString());
  });

  it("keeps the wall-clock time across the weekend the clocks go back (Nov 1)", () => {
    // Fri Oct 30 3:00 PM CDT is due Mon Nov 2 3:00 PM CST, which is 21:00 UTC.
    expect(paymentDueAt(ct("2026-10-30", "15:00")).toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });

  it("keeps the wall-clock time across the weekend the clocks go forward (Mar 14, 2027)", () => {
    // Fri Mar 12 3:00 PM CST (21:00 UTC) is due Mon Mar 15 3:00 PM CDT (20:00 UTC).
    expect(paymentDueAt("2027-03-12T21:00:00.000Z").toISOString()).toBe("2027-03-15T20:00:00.000Z");
  });

  it("keeps seconds and milliseconds", () => {
    expect(paymentDueAt("2026-10-20T20:00:07.250Z").toISOString()).toBe("2026-10-21T20:00:07.250Z");
  });

  it("counts other spans the same way", () => {
    expect(addWorkingHours(ct("2026-10-23", "15:00"), 1).toISOString()).toBe(new Date(ct("2026-10-23", "16:00")).toISOString());
    expect(addWorkingHours(ct("2026-10-23", "23:00"), 2).toISOString()).toBe(new Date(ct("2026-10-26", "01:00")).toISOString());
  });
});

describe("earliest bookable start: 48 working hours ahead", () => {
  it("Thu 15:00 → Mon 15:00, Fri 15:00 → Tue 15:00", () => {
    expect(earliestBookableStart(ct("2026-10-22", "15:00")).toISOString()).toBe(new Date(ct("2026-10-26", "15:00")).toISOString());
    expect(earliestBookableStart(ct("2026-10-23", "15:00")).toISOString()).toBe(new Date(ct("2026-10-27", "15:00")).toISOString());
  });

  it("puts payment due at least a working day before the earliest slot", () => {
    for (const now of [ct("2026-10-19", "09:00"), ct("2026-10-23", "17:00"), ct("2026-10-24", "12:00")]) {
      const due = paymentDueAt(now).getTime();
      expect(earliestBookableStart(now).getTime()).toBeGreaterThan(due);
    }
  });
});

describe("which slots a case can book", () => {
  const now = Date.parse(ct("2026-10-19", "09:00")); // Monday
  const slot = (date: string, start: string, end: string) => ({ starts_at: ct(date, start), ends_at: ct(date, end) });

  it("counts an empty or zero hours request as one hour, like pricing", () => {
    expect([billableHours(null), billableHours(undefined), billableHours(0), billableHours(-1), billableHours(3)]).toEqual([1, 1, 1, 1, 3]);
  });

  it("needs the slot to be at least as long as the hours requested", () => {
    expect(slotFitsHours(slot("2026-10-22", "10:00", "12:00"), 2)).toBe(true);
    expect(slotFitsHours(slot("2026-10-22", "10:00", "12:00"), 3)).toBe(false);
    expect(slotFitsHours(slot("2026-10-22", "10:00", "10:30"), null)).toBe(false);
  });

  it("needs the slot to start at least 48 working hours from now", () => {
    // Monday 9:00 + 48 working hours = Wednesday 9:00.
    expect(isSlotBookable(slot("2026-10-21", "09:00", "11:00"), 2, now)).toBe(true);
    expect(isSlotBookable(slot("2026-10-21", "08:30", "11:00"), 2, now)).toBe(false);
    expect(isSlotBookable(slot("2026-10-21", "09:00", "10:00"), 2, now)).toBe(false);
  });
});

describe("booking state", () => {
  const slot = { starts_at: ct("2026-10-28", "10:00") };
  const held = ct("2026-10-20", "15:00"); // due Wed Oct 21 15:00

  it("reads open, unpaid, overdue, paid and past", () => {
    expect(bookingState(slot, null, Date.parse(ct("2026-10-20", "16:00")))).toBe("open");
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-21", "14:59")))).toBe("unpaid");
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-21", "15:00")))).toBe("overdue");
    expect(bookingState(slot, { held_since: held, paid_at: ct("2026-10-21", "09:00") }, Date.parse(ct("2026-10-29", "10:00")))).toBe("paid");
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-28", "10:00")))).toBe("past");
  });
});

describe("labels", () => {
  it("shows a deadline as a Central time, or 'end of' a day at midnight", () => {
    expect(formatDeadline(ct("2026-10-26", "15:00"))).toBe("Mon, Oct 26, 3:00 PM CT");
    expect(formatDeadline(ct("2026-10-27", "00:00"))).toBe("end of Mon, Oct 26");
  });

  it("names a firm by its agreement name, then its email", () => {
    expect(firmLabel("Jane Roe", "jane@firm.test")).toBe("Jane Roe");
    expect(firmLabel("  ", "jane@firm.test")).toBe("jane@firm.test");
    expect(firmLabel(null, null)).toBe("A law firm");
  });
});
