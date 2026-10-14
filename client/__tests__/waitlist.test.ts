import { describe, it, expect } from "vitest";
import {
  assignSlot,
  sessionLengthHours,
  seatPayoutCents,
  waitlistPayoutCents,
  formatCents,
  isWaitlisted,
  HOURLY_RATE_CENTS,
  WAITLIST_WAIT_FEE_CENTS,
  WAITLISTED_STATUS,
} from "@/lib/participant/waitlist";

/* ---------------------------------------------------------------------------
   The waitlist's arithmetic: who gets which slot, how long a session is, and
   what each outcome pays. Pure — the DB writes and emails that consume these
   live in updateInviteStatus and session.ts.
--------------------------------------------------------------------------- */

describe("assignSlot", () => {
  const caps = { participantCap: 10, waitlistCap: 2 };

  it("gives a seat while seats remain", () => {
    expect(assignSlot({ ...caps, acceptedCount: 0, waitlistCount: 0 })).toBe("seat");
    expect(assignSlot({ ...caps, acceptedCount: 9, waitlistCount: 0 })).toBe("seat");
  });

  it("starts the waitlist exactly at the cap", () => {
    expect(assignSlot({ ...caps, acceptedCount: 10, waitlistCount: 0 })).toBe("waitlist");
    expect(assignSlot({ ...caps, acceptedCount: 10, waitlistCount: 1 })).toBe("waitlist");
  });

  it("refuses only once both the seats and the waitlist are gone", () => {
    expect(assignSlot({ ...caps, acceptedCount: 10, waitlistCount: 2 })).toBe("full");
  });

  it("still offers a seat when a called-in waitlister pushed the count past the cap", () => {
    // Calling someone in deliberately exceeds the cap, so acceptedCount can be
    // 11/10. That must not wrap around into offering seats again.
    expect(assignSlot({ ...caps, acceptedCount: 11, waitlistCount: 2 })).toBe("full");
    expect(assignSlot({ ...caps, acceptedCount: 11, waitlistCount: 1 })).toBe("waitlist");
  });

  it("honours a per-session waitlist cap of zero", () => {
    expect(
      assignSlot({ participantCap: 10, waitlistCap: 0, acceptedCount: 10, waitlistCount: 0 })
    ).toBe("full");
  });
});

describe("sessionLengthHours", () => {
  it("spans the earliest start to the latest end across every case", () => {
    expect(sessionLengthHours(["19:30:00", "22:30:00"], ["22:30:00", "00:30:00"])).toBe(5);
  });

  it("measures a single case", () => {
    expect(sessionLengthHours(["19:30:00"], ["22:30:00"])).toBe(3);
  });

  it("handles a half-hour session", () => {
    expect(sessionLengthHours(["09:00"], ["09:30"])).toBe(0.5);
  });

  it("treats an end before the start as running past midnight", () => {
    expect(sessionLengthHours(["23:00:00"], ["01:00:00"])).toBe(2);
  });

  it("returns 0 when times are missing or unparseable", () => {
    expect(sessionLengthHours([], [])).toBe(0);
    expect(sessionLengthHours([null], [undefined])).toBe(0);
    expect(sessionLengthHours(["nonsense"], ["also nonsense"])).toBe(0);
  });

  it("measures an evening session whose cases cross midnight UTC, on its own date", () => {
    // 5-6 PM and 6-7 PM CST, stored 23:00-00:00 and 00:00-01:00. Read as plain
    // minutes, the 00:00 start counted as the first one and this measured 1 hour.
    expect(sessionLengthHours(["23:00:00", "00:00:00"], ["00:00:00", "01:00:00"], "2026-11-05")).toBe(2);
    expect(sessionLengthHours(["00:00:00", "23:00:00"], ["01:00:00", "00:00:00"], "2026-11-05")).toBe(2);
    // 4-5:30 PM and 6:30-8 PM CST, stored 22:00-23:30 and 00:30-02:00: this was 23 hours.
    expect(sessionLengthHours(["22:00:00", "00:30:00"], ["23:30:00", "02:00:00"], "2026-11-05")).toBe(4);
    // 6-7:30 PM and 7:30-9 PM CDT, stored 23:00-00:30 and 00:30-02:00.
    expect(sessionLengthHours(["23:00:00", "00:30:00"], ["00:30:00", "02:00:00"], "2026-10-20")).toBe(3);
  });

  it("pays an evening seat for the whole session", () => {
    const hours = sessionLengthHours(["23:00:00", "00:00:00"], ["00:00:00", "01:00:00"], "2026-11-05");
    expect(formatCents(seatPayoutCents(hours))).toBe(formatCents(2 * HOURLY_RATE_CENTS));
  });
});

describe("payouts", () => {
  it("pays a seat the hourly rate for the session length", () => {
    expect(seatPayoutCents(3)).toBe(3 * HOURLY_RATE_CENTS);
    expect(formatCents(seatPayoutCents(3))).toBe("$90.00");
  });

  it("rounds a fractional session to whole cents", () => {
    expect(seatPayoutCents(2.5)).toBe(7_500);
    expect(formatCents(seatPayoutCents(2.5))).toBe("$75.00");
  });

  it("pays a called-in waitlister the FULL session, not the remainder", () => {
    // They held the slot from the start, so the call-in time is irrelevant.
    expect(waitlistPayoutCents("called_in", 3)).toBe(seatPayoutCents(3));
  });

  it("pays a waited-out waitlister the flat fee regardless of session length", () => {
    expect(waitlistPayoutCents("waited_out", 3)).toBe(WAITLIST_WAIT_FEE_CENTS);
    expect(waitlistPayoutCents("waited_out", 8)).toBe(WAITLIST_WAIT_FEE_CENTS);
    expect(formatCents(WAITLIST_WAIT_FEE_CENTS)).toBe("$10.00");
  });

  it("renders a missing amount as a dash rather than $0.00", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("isWaitlisted", () => {
  it("matches only the waitlisted status", () => {
    expect(isWaitlisted(WAITLISTED_STATUS)).toBe(true);
    expect(isWaitlisted("accepted")).toBe(false);
    expect(isWaitlisted("pending")).toBe(false);
    expect(isWaitlisted(null)).toBe(false);
    expect(isWaitlisted(undefined)).toBe(false);
  });
});
