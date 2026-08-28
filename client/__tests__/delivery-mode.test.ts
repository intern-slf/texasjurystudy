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
import {
  FILTER_PRIORITY,
  countyMatches,
  countyQueryForms,
  normalizeCountyName,
  relaxFilters,
  withCountyRestriction,
  type CaseFilters,
} from "@/lib/filter-utils";
import { OFFLINE_CATCHMENT_COUNTIES } from "@/lib/constants/offline-catchment";

/* ---------------------------------------------------------------------------
   ONLINE vs IN-PERSON

   The mode lives on the case and decides three unrelated things — what the
   requestee pays, what participants earn, and the waitlist's hold window and
   waiting fee (both formats HAVE a waitlist; only the terms differ). These are
   the pure pieces; the writes and emails that consume them are covered in
   sessions.test.ts.
--------------------------------------------------------------------------- */

describe("normalizeDeliveryMode", () => {
  it("passes through the two real values", () => {
    expect(normalizeDeliveryMode("online")).toBe("online");
    expect(normalizeDeliveryMode("offline")).toBe("offline");
  });

  it("degrades anything unrecognised to online, never to the in-person rate", () => {
    // A bad value must land on the cheaper, safer regime. Billing someone the
    // in-person rate because a column read back as "Offline" or null is
    // unrecoverable — and the two are close enough that nobody would notice.
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

/* ---------------------------------------------------------------------------
   IN-PERSON CATCHMENT

   Offline sessions draw from a fixed set of counties around the venue. Two
   things make this subtle enough to test directly:

   1. County names are stored with a " County" suffix that no picker uses, so a
      naive comparison matched a handful of rows and silently missed the rest.
   2. The catchment must NOT behave like a normal location filter — location is
      the first thing relaxFilters drops.
--------------------------------------------------------------------------- */

describe("county name matching", () => {
  it("treats the stored and picker spellings as the same county", () => {
    // This is the bug: jury_participants stores "Harris County", every filter
    // offers "Harris", and the old comparison was a plain equality.
    expect(normalizeCountyName("Harris County")).toBe("harris");
    expect(normalizeCountyName("Harris")).toBe("harris");
    expect(normalizeCountyName("  harris   COUNTY ")).toBe("harris");
    expect(countyMatches(["Harris"], "Harris County")).toBe(true);
    expect(countyMatches(["Harris County"], "Harris")).toBe(true);
  });

  it("keeps multi-word counties intact", () => {
    expect(normalizeCountyName("San Jacinto County")).toBe("san jacinto");
    expect(countyMatches(["San Jacinto"], "San Jacinto County")).toBe(true);
  });

  it("does not confuse Harris with Harrison", () => {
    // The reason the query uses two exact ilikes rather than `Harris%`:
    // Harrison County is a different place 200 miles away.
    expect(countyMatches(["Harris"], "Harrison County")).toBe(false);
    expect(normalizeCountyName("Harrison County")).toBe("harrison");
  });

  it("an empty filter matches everyone; an empty value matches nothing", () => {
    expect(countyMatches([], "Harris County")).toBe(true);
    expect(countyMatches(undefined, "Harris County")).toBe(true);
    expect(countyMatches(["Harris"], null)).toBe(false);
    expect(countyMatches(["Harris"], "")).toBe(false);
  });

  it("queries both stored spellings, never a prefix wildcard", () => {
    expect(countyQueryForms("Harris")).toEqual(["Harris", "Harris County"]);
    expect(countyQueryForms("Harris County")).toEqual(["Harris", "Harris County"]);
    for (const form of countyQueryForms("Harris")) {
      expect(form).not.toContain("%");
      expect(form).not.toContain("*");
    }
  });
});

describe("in-person catchment", () => {
  it("is the six counties around the venue", () => {
    expect([...OFFLINE_CATCHMENT_COUNTIES]).toEqual([
      "Montgomery", "Walker", "San Jacinto", "Grimes", "Harris", "Houston",
    ]);
  });

  it("matches participants however their county is spelled", () => {
    const inside = ["Harris County", "Montgomery County", "San Jacinto County", "Harris"];
    for (const c of inside) {
      expect(countyMatches([...OFFLINE_CATCHMENT_COUNTIES], c)).toBe(true);
    }
  });

  it("excludes the counties the panel actually lives in", () => {
    // Collin, Dallas, Smith and Lubbock hold most of the panel and are all far
    // outside the travel radius. If any of these ever passes, the catchment has
    // silently stopped working.
    for (const c of ["Collin County", "Dallas County", "Smith County", "Lubbock County"]) {
      expect(countyMatches([...OFFLINE_CATCHMENT_COUNTIES], c)).toBe(false);
    }
  });

  it("is NOT expressed as a location filter, so relaxation cannot drop it", () => {
    // location is FILTER_PRIORITY[0]. Anything the catchment put there would be
    // gone at the first relaxation level, which is why applyOfflineCatchment
    // writes a query constraint instead.
    expect(FILTER_PRIORITY[0]).toBe("location");
    const relaxed = relaxFilters({ location: { county: ["Harris"] } }, 1);
    expect(relaxed.location).toBeUndefined();
  });

  it("an in-person case no longer forces its own county into the filters", () => {
    // Superseded rule: the travel radius belongs to the venue, not the lawsuit,
    // so a case pending in Dallas still draws from the catchment.
    const f = withCountyRestriction({}, {
      county: "Dallas",
      participants_from_county: "No",
      delivery_mode: "offline",
    });
    expect(f.location?.county).toBeUndefined();
  });

  it("still honours an explicit 'participants from my county' request", () => {
    const f = withCountyRestriction({}, {
      county: "Harris",
      participants_from_county: "Yes",
      delivery_mode: "online",
    });
    expect(f.location?.county).toEqual(["Harris"]);
  });
});
