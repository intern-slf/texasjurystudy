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
  hourlyRateCents,
  seatPayoutCents,
  supportsWaitlist,
  waitlistCapFor,
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
  it("charges $850/hr online and $10,000/hr in person", () => {
    expect(baseRatePerHourCents("online")).toBe(85_000);
    expect(baseRatePerHourCents("offline")).toBe(1_000_000);
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
    expect(offline.totalCostCents).toBe(2_000_000 + 30_000);
    expect(formatReceiptCents(offline.totalCostCents)).toBe("$20,300.00");
  });

  it("reports the rate it used so the receipt can show it", () => {
    expect(calculateReceiptPrice(null, 1, "offline").baseRatePerHourCents).toBe(1_000_000);
    expect(calculateReceiptPrice(null, 1, "online").baseRatePerHourCents).toBe(85_000);
  });
});

describe("participant payout", () => {
  it("pays $30/hr online and $100/hr in person", () => {
    expect(hourlyRateCents("online")).toBe(HOURLY_RATE_CENTS);
    expect(hourlyRateCents("offline")).toBe(OFFLINE_HOURLY_RATE_CENTS);
    expect(HOURLY_RATE_CENTS).toBe(3_000);
    expect(OFFLINE_HOURLY_RATE_CENTS).toBe(10_000);
  });

  it("defaults to the online rate when no mode is passed", () => {
    expect(seatPayoutCents(3)).toBe(9_000);
  });

  it("scales the seat payout by session length", () => {
    expect(seatPayoutCents(3, "offline")).toBe(30_000); // 3 hrs × $100
    expect(seatPayoutCents(1.5, "offline")).toBe(15_000);
    expect(seatPayoutCents(1.5, "online")).toBe(4_500);
  });

  it("pays a called-in waitlister at the session's rate", () => {
    expect(waitlistPayoutCents("called_in", 2, "online")).toBe(6_000);
    // Unreachable in practice — offline sessions never create a waitlisted row —
    // but if one ever existed it must not be paid at the online rate.
    expect(waitlistPayoutCents("called_in", 2, "offline")).toBe(20_000);
  });

  it("leaves the flat waiting fee alone", () => {
    expect(waitlistPayoutCents("waited_out", 4, "online")).toBe(WAITLIST_WAIT_FEE_CENTS);
    expect(waitlistPayoutCents("waited_out", 4, "offline")).toBe(WAITLIST_WAIT_FEE_CENTS);
  });
});

describe("waitlist availability", () => {
  it("forces the in-person waitlist cap to zero whatever the column says", () => {
    expect(waitlistCapFor("offline", 2)).toBe(0);
    expect(waitlistCapFor("offline", 99)).toBe(0);
    expect(waitlistCapFor("offline", null)).toBe(0);
  });

  it("honours the stored cap online, falling back to the default", () => {
    expect(waitlistCapFor("online", 5)).toBe(5);
    expect(waitlistCapFor("online", 0)).toBe(0);
    expect(waitlistCapFor("online", null)).toBe(2);
    expect(waitlistCapFor("online", undefined)).toBe(2);
  });

  it("says plainly which sessions have a waitlist", () => {
    expect(supportsWaitlist("online")).toBe(true);
    expect(supportsWaitlist("offline")).toBe(false);
    expect(supportsWaitlist(null)).toBe(true);
  });
});
