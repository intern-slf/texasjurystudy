import { describe, it, expect } from "vitest";
import { sessionStartInstant, hasSessionStarted } from "@/lib/participant/sessionStart";

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
