import { describe, it, expect } from "vitest";
import {
  addWorkingHours,
  bookingState,
  earliestBookableStart,
  firmLabel,
  formatDeadline,
  hoursLeftLabel,
  isSlotBookable,
  isSlotFullError,
  paymentDueAt,
  slotFitsHours,
  slotMinutes,
} from "@/lib/slotBooking";
import { billableHours } from "@/lib/receipt-pricing";

// October 2026 is Central Daylight Time (UTC-5): 15:00 CT is 20:00 UTC.
const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

describe("shared slots: several cases take the hours their firms pay for", () => {
  const slot = { starts_at: ct("2026-10-29", "09:00"), ends_at: ct("2026-10-29", "12:00") };

  it("measures a slot", () => {
    expect(slotMinutes(slot)).toBe(180);
  });

  it("fits a case in what is left, when that is known, else in the whole slot", () => {
    expect(slotFitsHours({ ...slot, minutes_left: 120 }, 2)).toBe(true);
    expect(slotFitsHours({ ...slot, minutes_left: 120 }, 3)).toBe(false);
    expect(slotFitsHours({ ...slot, minutes_left: 60 }, null)).toBe(true);
    expect(slotFitsHours({ ...slot, minutes_left: 0 }, null)).toBe(false);
    expect(slotFitsHours(slot, 3)).toBe(true);
  });

  it("tells firms the hours left, once some are booked", () => {
    expect(hoursLeftLabel({ ...slot, minutes_left: 120 })).toBe("2 of 3 hours left");
    expect(hoursLeftLabel({ ...slot, minutes_left: 60 })).toBe("1 of 3 hours left");
    expect(hoursLeftLabel({ ...slot, minutes_left: 90 })).toBe("1 hour 30 minutes of 3 hours left");
    expect(hoursLeftLabel({ ...slot, minutes_left: 180 })).toBeNull();
    expect(hoursLeftLabel(slot)).toBeNull();
  });

  it("knows the database's refusal of an over-full slot", () => {
    expect(isSlotFullError({ code: "23514", message: "requestee_slot_full: 0 minutes left in this slot, 60 needed" })).toBe(true);
    expect(isSlotFullError({ code: "23514", message: "new row violates check constraint" })).toBe(false);
    expect(isSlotFullError({ code: "23505", message: "requestee_slot_full" })).toBe(false);
    expect(isSlotFullError(null)).toBe(false);
  });
});

describe("payment deadline: 11:59 PM Central on the day the case runs", () => {
  it("is the end of the held slot's day", () => {
    const slot = { starts_at: ct("2026-10-29", "09:00") };
    expect(paymentDueAt({ slot })!.toISOString()).toBe(new Date(ct("2026-10-29", "23:59")).toISOString());
    expect(formatDeadline(paymentDueAt({ slot })!)).toBe("Thu, Oct 29, 11:59 PM CT");
  });

  it("goes by the Central day, not the UTC one", () => {
    // 8:00 PM CDT on Oct 29 is already Oct 30 in UTC.
    const slot = { starts_at: ct("2026-10-29", "20:00") };
    expect(paymentDueAt({ slot })!.toISOString()).toBe(new Date(ct("2026-10-29", "23:59")).toISOString());
  });

  it("is the end of the session's day once the case is in one, whatever slot it held", () => {
    const slot = { starts_at: ct("2026-10-29", "09:00") };
    // Nov 3 is Central Standard Time (UTC-6).
    expect(paymentDueAt({ slot, sessionDate: "2026-11-03" })!.toISOString()).toBe("2026-11-04T05:59:00.000Z");
    expect(paymentDueAt({ sessionDate: "2026-11-03" })!.toISOString()).toBe("2026-11-04T05:59:00.000Z");
  });

  it("is null until the case is scheduled", () => {
    expect(paymentDueAt({})).toBeNull();
    expect(paymentDueAt({ slot: null, sessionDate: null })).toBeNull();
  });
});

describe("working hours, Monday to Friday on the Central clock", () => {
  it("skips the weekend", () => {
    expect(addWorkingHours(ct("2026-10-23", "15:00"), 1).toISOString()).toBe(new Date(ct("2026-10-23", "16:00")).toISOString());
    expect(addWorkingHours(ct("2026-10-23", "23:00"), 2).toISOString()).toBe(new Date(ct("2026-10-26", "01:00")).toISOString());
    expect(addWorkingHours(ct("2026-10-24", "10:00"), 24).toISOString()).toBe(new Date(ct("2026-10-27", "00:00")).toISOString());
  });

  it("keeps the wall-clock time across the weekend the clocks go back (Nov 1)", () => {
    // Fri Oct 30 3:00 PM CDT + 24 working hours is Mon Nov 2 3:00 PM CST, which is 21:00 UTC.
    expect(addWorkingHours(ct("2026-10-30", "15:00"), 24).toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });

  it("keeps seconds and milliseconds", () => {
    expect(addWorkingHours("2026-10-20T20:00:07.250Z", 24).toISOString()).toBe("2026-10-21T20:00:07.250Z");
  });
});

describe("earliest bookable start: 48 working hours ahead", () => {
  it("Thu 15:00 → Mon 15:00, Fri 15:00 → Tue 15:00", () => {
    expect(earliestBookableStart(ct("2026-10-22", "15:00")).toISOString()).toBe(new Date(ct("2026-10-26", "15:00")).toISOString());
    expect(earliestBookableStart(ct("2026-10-23", "15:00")).toISOString()).toBe(new Date(ct("2026-10-27", "15:00")).toISOString());
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
  const held = ct("2026-10-20", "15:00");

  it("reads open, unpaid, overdue once the slot's day is over, and paid", () => {
    expect(bookingState(slot, null, Date.parse(ct("2026-10-20", "16:00")))).toBe("open");
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-22", "15:00")))).toBe("unpaid");
    // Its time has come, but payment isn't due until the end of the day.
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-28", "13:00")))).toBe("unpaid");
    expect(bookingState(slot, { held_since: held, paid_at: null }, Date.parse(ct("2026-10-28", "23:59")))).toBe("overdue");
    expect(bookingState(slot, { held_since: held, paid_at: ct("2026-10-21", "09:00") }, Date.parse(ct("2026-10-29", "10:00")))).toBe("paid");
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
