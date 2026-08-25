import { describe, it, expect } from "vitest";
import {
  DEFAULT_DELIVERY_MODE,
  assertCasesShareDeliveryMode,
  deliveryModeLabel,
  isOffline,
  normalizeDeliveryMode,
  sessionDeliveryMode,
  sessionDeliveryModeOrDefault,
} from "@/lib/case/deliveryMode";
import {
  baseRatePerHourCents,
  calculateReceiptPrice,
  formatCents as formatReceiptCents,
} from "@/lib/receipt-pricing";
import {
  HOURLY_RATE_CENTS,
  OFFLINE_HOURLY_RATE_CENTS,
  WAITLIST_WAIT_FEE_CENTS,
  OFFLINE_WAITLIST_WAIT_FEE_CENTS,
  WAITLIST_HOLD_MINUTES,
  OFFLINE_WAITLIST_HOLD_MINUTES,
  hourlyRateCents,
  seatPayoutCents,
  waitlistCapFor,
  waitlistHoldMinutes,
  waitlistWaitFeeCents,
  waitlistPayoutCents,
} from "@/lib/participant/waitlist";
import type { CaseFilters } from "@/lib/filter-utils";

/* ---------------------------------------------------------------------------
   ONLINE vs IN-PERSON

   The mode lives on the case and decides three unrelated things — what the
   requestee pays, what participants earn, and whether a waitlist exists. These
   are the pure pieces; the writes and emails that consume them are covered in
   sessions.test.ts.
--------------------------------------------------------------------------- */

describe("normalizeDeliveryMode", () => {
  it("passes through the two real values", () => {
    expect(normalizeDeliveryMode("online")).toBe("online");
    expect(normalizeDeliveryMode("offline")).toBe("offline");
  });

  it("degrades anything unrecognised to online, never to the $10,000 rate", () => {
    // A bad value must land on the cheaper, safer regime. Billing someone
    // 12× because a column read back as "Offline" or null is unrecoverable.
    for (const bad of [null, undefined, "", "Offline", "OFFLINE", "in-person", 0, {}]) {
      expect(normalizeDeliveryMode(bad)).toBe("online");
    }
    expect(DEFAULT_DELIVERY_MODE).toBe("online");
  });
});

describe("isOffline / deliveryModeLabel", () => {
  it("reads the mode the same way normalize does", () => {
    expect(isOffline("offline")).toBe(true);
    expect(isOffline("online")).toBe(false);
    expect(isOffline(null)).toBe(false);
    expect(isOffline("OFFLINE")).toBe(false);
  });

  it("labels for humans", () => {
    expect(deliveryModeLabel("offline")).toBe("In-Person");
    expect(deliveryModeLabel("online")).toBe("Online");
    expect(deliveryModeLabel(null)).toBe("Online");
  });
});

describe("sessionDeliveryMode", () => {
  it("is null for a session with no cases — there is nothing to derive from", () => {
    expect(sessionDeliveryMode([])).toBeNull();
  });

  it("returns the shared mode", () => {
    expect(sessionDeliveryMode(["online", "online"])).toBe("online");
    expect(sessionDeliveryMode(["offline", "offline", "offline"])).toBe("offline");
  });

  it("treats a null case mode as online rather than as a disagreement", () => {
    expect(sessionDeliveryMode(["online", null])).toBe("online");
  });

  it("throws on a mixed session instead of guessing a rate", () => {
    expect(() => sessionDeliveryMode(["online", "offline"])).toThrow(
      /both online and in-person/i,
    );
  });

  it("has a non-throwing twin for read-only surfaces", () => {
    expect(sessionDeliveryModeOrDefault([])).toBe("online");
    expect(sessionDeliveryModeOrDefault(["online", "offline"])).toBe("offline");
    expect(sessionDeliveryModeOrDefault(["online"])).toBe("online");
  });
});

describe("assertCasesShareDeliveryMode", () => {
  it("accepts an all-online or all-offline set", () => {
    expect(assertCasesShareDeliveryMode(["online", "online"])).toBe("online");
    expect(assertCasesShareDeliveryMode(["offline", "offline"])).toBe("offline");
  });

  it("accepts an empty set — attaching nothing conflicts with nothing", () => {
    expect(assertCasesShareDeliveryMode([])).toBeNull();
    expect(assertCasesShareDeliveryMode([], [])).toBeNull();
  });

  it("rejects a mix within the incoming cases", () => {
    expect(() => assertCasesShareDeliveryMode(["online", "offline"])).toThrow(
      /cannot hold both in-person and online/i,
    );
  });

  it("rejects an incoming case that clashes with what is already attached", () => {
    expect(() => assertCasesShareDeliveryMode(["online"], ["offline"])).toThrow(
      /cannot hold both in-person and online/i,
    );
    expect(() => assertCasesShareDeliveryMode(["offline"], ["online"])).toThrow(
      /cannot hold both in-person and online/i,
    );
  });

  it("accepts an incoming case matching what is already attached", () => {
    expect(assertCasesShareDeliveryMode(["offline"], ["offline", "offline"])).toBe("offline");
  });
});

describe("requestee pricing", () => {
  it("charges $850/hr online and $1,500/hr in person", () => {
    expect(baseRatePerHourCents("online")).toBe(85_000);
    expect(baseRatePerHourCents("offline")).toBe(150_000);
    expect(baseRatePerHourCents(null)).toBe(85_000);
  });

  it("defaults to the online rate when no mode is passed", () => {
    // Every call site that predates this feature omits the argument, and the
    // quote it produces must not move.
    const before = calculateReceiptPrice(null, 2);
    expect(before.totalCostCents).toBe(170_000);
    expect(before.deliveryMode).toBe("online");
  });

  it("keeps the $100 filter add-ons on top of the in-person rate", () => {
    const filters = {
      gender: ["Female"],
      race: ["Asian"],
      political_affiliation: ["Independent"],
    } as CaseFilters;

    const online = calculateReceiptPrice(filters, 2, "online");
    const offline = calculateReceiptPrice(filters, 2, "offline");

    expect(online.filterItems).toHaveLength(3);
    expect(offline.filterItems).toHaveLength(3);
    // Filters cost the same either way — only the base moves.
    expect(offline.filterCostCents).toBe(online.filterCostCents);
    expect(offline.filterCostCents).toBe(30_000);

    expect(online.totalCostCents).toBe(170_000 + 30_000);
    expect(offline.totalCostCents).toBe(300_000 + 30_000);
    expect(formatReceiptCents(offline.totalCostCents)).toBe("$3,300.00");
  });

  it("reports the rate it used so the receipt can show it", () => {
    expect(calculateReceiptPrice(null, 1, "offline").baseRatePerHourCents).toBe(150_000);
    expect(calculateReceiptPrice(null, 1, "online").baseRatePerHourCents).toBe(85_000);
  });
});

describe("participant payout", () => {
  it("pays $30/hr online and $40/hr in person", () => {
    expect(hourlyRateCents("online")).toBe(HOURLY_RATE_CENTS);
    expect(hourlyRateCents("offline")).toBe(OFFLINE_HOURLY_RATE_CENTS);
    expect(HOURLY_RATE_CENTS).toBe(3_000);
    expect(OFFLINE_HOURLY_RATE_CENTS).toBe(4_000);
  });

  it("defaults to the online rate when no mode is passed", () => {
    expect(seatPayoutCents(3)).toBe(9_000);
  });

  it("scales the seat payout by session length", () => {
    expect(seatPayoutCents(3, "offline")).toBe(12_000); // 3 hrs × $40
    expect(seatPayoutCents(1.5, "offline")).toBe(6_000);
    expect(seatPayoutCents(1.5, "online")).toBe(4_500);
  });

  it("pays a called-in waitlister at the session's rate", () => {
    expect(waitlistPayoutCents("called_in", 2, "online")).toBe(6_000);
    expect(waitlistPayoutCents("called_in", 2, "offline")).toBe(8_000);
  });

  it("pays the waiting fee at the session's own flat rate", () => {
    // $10 online, $30 in person — the in-person holder travelled to the venue.
    expect(waitlistPayoutCents("waited_out", 4, "online")).toBe(WAITLIST_WAIT_FEE_CENTS);
    expect(waitlistPayoutCents("waited_out", 4, "offline")).toBe(OFFLINE_WAITLIST_WAIT_FEE_CENTS);
    expect(WAITLIST_WAIT_FEE_CENTS).toBe(1_000);
    expect(OFFLINE_WAITLIST_WAIT_FEE_CENTS).toBe(3_000);
    // Flat means flat: session length must not move it.
    expect(waitlistPayoutCents("waited_out", 1, "offline")).toBe(
      waitlistPayoutCents("waited_out", 9, "offline"),
    );
  });
});

describe("waitlist terms", () => {
  it("offers the same number of slots in both formats", () => {
    // Both formats have a waitlist; what differs is the hold window and the fee,
    // not the size. The cap is the stored column, defaulting to 2.
    for (const mode of ["online", "offline", null] as const) {
      expect(waitlistCapFor(mode, 5)).toBe(5);
      expect(waitlistCapFor(mode, 0)).toBe(0);
      expect(waitlistCapFor(mode, null)).toBe(2);
      expect(waitlistCapFor(mode, undefined)).toBe(2);
    }
  });

  it("holds an in-person waitlister twice as long", () => {
    expect(waitlistHoldMinutes("online")).toBe(WAITLIST_HOLD_MINUTES);
    expect(waitlistHoldMinutes("offline")).toBe(OFFLINE_WAITLIST_HOLD_MINUTES);
    expect(WAITLIST_HOLD_MINUTES).toBe(15);
    expect(OFFLINE_WAITLIST_HOLD_MINUTES).toBe(30);
    expect(waitlistHoldMinutes(null)).toBe(WAITLIST_HOLD_MINUTES);
  });

  it("pays an in-person waitlister three times the waiting fee", () => {
    expect(waitlistWaitFeeCents("online")).toBe(1_000);
    expect(waitlistWaitFeeCents("offline")).toBe(3_000);
    expect(waitlistWaitFeeCents(null)).toBe(1_000);
  });
});
