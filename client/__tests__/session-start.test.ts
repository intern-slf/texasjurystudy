import { describe, it, expect } from "vitest";
import {
  sessionStartInstant,
  hasSessionStarted,
  sessionEndInstant,
  cooldownAfterSession,
} from "@/lib/participant/sessionStart";

/* ---------------------------------------------------------------------------
   The cutoff behind "you can no longer accept this invitation".

   `session_cases.start_time` is stored UTC (addCasesToSession runs the admin's
   local input through localToUTCTime), and the session date is a Central date,
   so a start time is a real instant on that date: an evening one falls on the
   next UTC day. `now` is injected so these are not clock-flaky.
--------------------------------------------------------------------------- */

const at = (iso: string) => new Date(iso);

describe("sessionStartInstant", () => {
  it("anchors to the earliest case start time, not the first row", () => {
    const start = sessionStartInstant("2026-08-22", ["19:30:00", "09:00:00", "13:15:00"]);
    expect(start?.toISOString()).toBe("2026-08-22T09:00:00.000Z");
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    expect(sessionStartInstant("2026-08-22", ["19:30"])?.toISOString()).toBe(
      "2026-08-22T19:30:00.000Z"
    );
  });

  it("tolerates a full timestamp in the date column", () => {
    expect(sessionStartInstant("2026-08-22T00:00:00+00:00", ["19:30:00"])?.toISOString()).toBe(
      "2026-08-22T19:30:00.000Z"
    );
  });

  it("falls back to midnight UTC when the session has no case times", () => {
    // A session with no cases cannot be run, so the day itself closes it.
    expect(sessionStartInstant("2026-08-22", [])?.toISOString()).toBe(
      "2026-08-22T00:00:00.000Z"
    );
    expect(sessionStartInstant("2026-08-22", [null, undefined])?.toISOString()).toBe(
      "2026-08-22T00:00:00.000Z"
    );
  });

  it("returns null when there is no usable date", () => {
    expect(sessionStartInstant(null, ["19:30:00"])).toBeNull();
    expect(sessionStartInstant("", ["19:30:00"])).toBeNull();
    expect(sessionStartInstant("not-a-date", ["19:30:00"])).toBeNull();
  });

  it("ignores unparseable times rather than throwing", () => {
    expect(sessionStartInstant("2026-08-22", ["garbage", "19:30:00"])?.toISOString()).toBe(
      "2026-08-22T19:30:00.000Z"
    );
  });

  it("puts an evening start on the next UTC day", () => {
    // 7:30 PM CDT on Oct 20, and 6:00 PM CST on Nov 10. Read on the session's own
    // UTC date, both came out a day early.
    expect(sessionStartInstant("2026-10-20", ["00:30:00"])?.toISOString()).toBe("2026-10-21T00:30:00.000Z");
    expect(sessionStartInstant("2026-11-10", ["00:00:00"])?.toISOString()).toBe("2026-11-11T00:00:00.000Z");
  });

  it("starts an evening session whose cases cross midnight UTC at its first case", () => {
    // 5-6 PM and 6-7 PM CST: as text, "00:00" sorted before "23:00".
    expect(sessionStartInstant("2026-11-05", ["00:00:00", "23:00:00"])?.toISOString()).toBe(
      "2026-11-05T23:00:00.000Z"
    );
  });
});

describe("hasSessionStarted", () => {
  const date = "2026-08-22";
  const times = ["19:30:00", "22:30:00"];

  it("is false a minute before the first case begins", () => {
    expect(hasSessionStarted(date, times, at("2026-08-22T19:29:59Z"))).toBe(false);
  });

  it("is true exactly at the first case start", () => {
    expect(hasSessionStarted(date, times, at("2026-08-22T19:30:00Z"))).toBe(true);
  });

  it("stays true while the session runs and after it ends", () => {
    expect(hasSessionStarted(date, times, at("2026-08-22T21:00:00Z"))).toBe(true);
    expect(hasSessionStarted(date, times, at("2026-09-01T00:00:00Z"))).toBe(true);
  });

  it("is false earlier the same day", () => {
    // The gate is the case start, not midnight — a same-day accept is still fine.
    expect(hasSessionStarted(date, times, at("2026-08-22T08:00:00Z"))).toBe(false);
  });

  it("keeps an evening session open until it really begins", () => {
    // 7:30 PM CDT on Oct 20, stored as 00:30. It used to close at 7:30 PM on Oct 19.
    const evening = ["00:30:00"];
    expect(hasSessionStarted("2026-10-20", evening, at("2026-10-20T01:00:00Z"))).toBe(false); // Oct 19, 8 PM
    expect(hasSessionStarted("2026-10-20", evening, at("2026-10-20T15:00:00Z"))).toBe(false); // Oct 20, 10 AM
    expect(hasSessionStarted("2026-10-20", evening, at("2026-10-21T00:29:59Z"))).toBe(false);
    expect(hasSessionStarted("2026-10-20", evening, at("2026-10-21T00:30:00Z"))).toBe(true);
  });

  it("does not block when the date cannot be read", () => {
    // Better to let the response through than to reject on an unreadable row.
    expect(hasSessionStarted(null, times, at("2030-01-01T00:00:00Z"))).toBe(false);
    expect(hasSessionStarted("not-a-date", times, at("2030-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("sessionEndInstant", () => {
  it("takes the latest case end", () => {
    expect(
      sessionEndInstant("2026-08-22", ["19:30:00", "21:00:00"], ["21:00:00", "22:30:00"])?.toISOString()
    ).toBe("2026-08-22T22:30:00.000Z");
  });

  it("rolls an end past midnight onto the next day", () => {
    // The plain maximum would pick 22:30 over 00:30 and end the session early.
    expect(
      sessionEndInstant("2026-08-22", ["19:30:00", "22:30:00"], ["22:30:00", "00:30:00"])?.toISOString()
    ).toBe("2026-08-23T00:30:00.000Z");
  });

  it("ends an evening session whose cases cross midnight UTC at its last case", () => {
    // 5-6 PM and 6-7 PM CST, stored 23:00-00:00 and 00:00-01:00.
    expect(
      sessionEndInstant("2026-11-05", ["00:00:00", "23:00:00"], ["01:00:00", "00:00:00"])?.toISOString()
    ).toBe("2026-11-06T01:00:00.000Z");
  });

  it("falls back to the start when there are no end times", () => {
    expect(sessionEndInstant("2026-08-22", ["19:30:00"], [])?.toISOString()).toBe(
      "2026-08-22T19:30:00.000Z"
    );
  });

  it("returns null when the date cannot be read", () => {
    expect(sessionEndInstant(null, ["19:30:00"], ["22:30:00"])).toBeNull();
  });
});

describe("cooldownAfterSession", () => {
  it("is the day after the session ends, in UTC", () => {
    // Regression: this used to build the date without a `Z`, so it parsed in the
    // server's local zone — correct only by luck on a UTC host.
    expect(cooldownAfterSession("2026-08-22", ["19:30:00"], ["22:30:00"])).toBe(
      "2026-08-23T22:30:00.000Z"
    );
  });

  it("counts from the real end of a session that runs past midnight", () => {
    expect(
      cooldownAfterSession("2026-08-22", ["19:30:00", "22:30:00"], ["22:30:00", "00:30:00"])
    ).toBe("2026-08-24T00:30:00.000Z");
  });

  it("counts from the real end of an evening session", () => {
    // 7:30-9:00 PM CDT on Oct 20 ends at 02:00 UTC on Oct 21. Read on Oct 20 UTC,
    // the cooldown ran out when the session ended instead of a day later.
    expect(cooldownAfterSession("2026-10-20", ["00:30:00"], ["02:00:00"])).toBe("2026-10-22T02:00:00.000Z");
  });

  it("crosses a month boundary without drifting", () => {
    // Date.setDate() works in local time; adding 24h of milliseconds does not.
    expect(cooldownAfterSession("2026-08-31", ["19:30:00"], ["22:30:00"])).toBe(
      "2026-09-01T22:30:00.000Z"
    );
  });

  it("crosses a year boundary", () => {
    expect(cooldownAfterSession("2026-12-31", ["19:30:00"], ["22:30:00"])).toBe(
      "2027-01-01T22:30:00.000Z"
    );
  });

  it("returns null when the session times cannot be read, so the cooldown is left alone", () => {
    expect(cooldownAfterSession(null, ["19:30:00"], ["22:30:00"])).toBeNull();
    expect(cooldownAfterSession("not-a-date", ["19:30:00"], ["22:30:00"])).toBeNull();
  });
});
