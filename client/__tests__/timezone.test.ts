import { describe, it, expect, vi, afterEach } from "vitest";
import { formatSessionTime, localToUTC, localToUTCTime } from "@/lib/timezone";

describe("localToUTC", () => {
  it("returns the same instant when the timezone is UTC", () => {
    expect(localToUTC("2025-01-15", "10:00", "UTC")).toBe("2025-01-15T10:00:00.000Z");
  });

  it("adds 5h for America/New_York during standard time (January)", () => {
    expect(localToUTC("2025-01-15", "10:00", "America/New_York")).toBe(
      "2025-01-15T15:00:00.000Z"
    );
  });

  it("adds 4h for America/New_York during DST (July)", () => {
    expect(localToUTC("2025-07-15", "10:00", "America/New_York")).toBe(
      "2025-07-15T14:00:00.000Z"
    );
  });

  it("subtracts 5:30 for Asia/Kolkata (non-whole-hour offset)", () => {
    expect(localToUTC("2025-01-15", "10:00", "Asia/Kolkata")).toBe(
      "2025-01-15T04:30:00.000Z"
    );
  });

  it("handles a date inside the spring-forward window without throwing", () => {
    expect(() => localToUTC("2025-03-09", "02:30", "America/New_York")).not.toThrow();
    const result = localToUTC("2025-03-09", "02:30", "America/New_York");
    expect(result).toMatch(/^2025-03-09T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("handles a date inside the fall-back ambiguous window without throwing", () => {
    expect(() => localToUTC("2025-11-02", "01:30", "America/New_York")).not.toThrow();
    const result = localToUTC("2025-11-02", "01:30", "America/New_York");
    expect(result).toMatch(/^2025-11-02T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("throws for an invalid IANA zone string", () => {
    expect(() => localToUTC("2025-01-15", "10:00", "Not/A_Zone")).toThrow();
  });
});

describe("localToUTCTime", () => {
  it("returns the HH:MM:SS portion of the UTC instant", () => {
    expect(localToUTCTime("2025-01-15", "10:00", "America/New_York")).toBe("15:00:00");
  });

  it("returns the DST-adjusted time in July", () => {
    expect(localToUTCTime("2025-07-15", "10:00", "America/New_York")).toBe("14:00:00");
  });

  it("returns 04:30:00 for 10:00 Asia/Kolkata", () => {
    expect(localToUTCTime("2025-01-15", "10:00", "Asia/Kolkata")).toBe("04:30:00");
  });
});

describe("formatSessionTime", () => {
  // Some ICU versions put a narrow no-break space before AM/PM.
  const shown = (sessionDate: string | undefined, utcTime: string) =>
    formatSessionTime(sessionDate, utcTime, "America/Chicago").replace(/\s/g, " ");

  afterEach(() => vi.useRealTimers());

  it("shows a November session in Central Standard Time while it is still October", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    // 10:00 AM CST is stored as 16:00 UTC. On an October date it read as 11:00 AM.
    expect(shown("2026-11-05", "16:00:00")).toBe("10:00 AM");
    expect(shown("2026-10-20", "15:00:00")).toBe("10:00 AM");
  });

  it("shows an October session in Central Daylight Time once it is November", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    expect(shown("2026-10-29", "15:00:00")).toBe("10:00 AM");
  });

  it("finds an evening session, which is stored on the next UTC day", () => {
    // 7:00 PM CDT on Oct 20 is 00:00 UTC on Oct 21.
    expect(shown("2026-10-20", "00:00:00")).toBe("7:00 PM");
    // 7:00 PM CST on the changeover day, Nov 1, is 01:00 UTC on Nov 2.
    expect(shown("2026-11-01", "01:00:00")).toBe("7:00 PM");
  });

  it("falls back to today's date when the session has none", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    expect(shown(undefined, "15:00:00")).toBe("10:00 AM");
  });
});
