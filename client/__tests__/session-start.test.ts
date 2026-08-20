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
   local input through localToUTCTime), so the session date plus the earliest
   start time is a real instant. `now` is injected so these are not clock-flaky.
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
