import { describe, it, expect } from "vitest";
import { localToUTC, localToUTCTime } from "@/lib/timezone";

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
