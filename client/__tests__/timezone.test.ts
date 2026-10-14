import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calendarDate,
  formatSessionSpan,
  formatSessionTime,
  localToUTC,
  localToUTCTime,
  sessionSpan,
  sessionTimeInstant,
  utcTimeToLocal,
} from "@/lib/timezone";

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

describe("sessionTimeInstant", () => {
  const iso = (sessionDate: string, utcTime: string) => sessionTimeInstant(sessionDate, utcTime).toISOString();

  it("puts a daytime time on the session's own date", () => {
    expect(iso("2026-11-05", "16:00:00")).toBe("2026-11-05T16:00:00.000Z");
  });

  it("puts an evening time on the next UTC day", () => {
    // 7:00 PM CDT on Oct 20, and 6:00 PM CST on Nov 10.
    expect(iso("2026-10-20", "00:00:00")).toBe("2026-10-21T00:00:00.000Z");
    expect(iso("2026-11-10", "00:00:00")).toBe("2026-11-11T00:00:00.000Z");
  });

  it("finds the evening of a clock-change Sunday", () => {
    // 7:00 PM CST on Nov 1, and 7:00 PM CDT on Mar 14.
    expect(iso("2026-11-01", "01:00:00")).toBe("2026-11-02T01:00:00.000Z");
    expect(iso("2027-03-14", "00:00:00")).toBe("2027-03-15T00:00:00.000Z");
  });

  it("reads 24:00, which a time column allows, as the next midnight", () => {
    expect(iso("2026-11-05", "24:00:00")).toBe("2026-11-06T00:00:00.000Z");
  });

  it("treats a date that doesn't exist like no date, rather than throwing", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    try {
      expect(iso("2026-13-45", "15:00:00")).toBe("2026-10-14T15:00:00.000Z");
      expect(iso("2026-02-30", "15:00:00")).toBe("2026-10-14T15:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("calendarDate", () => {
  it("takes the date a date or timestamp starts with", () => {
    expect(calendarDate("2026-11-05")).toBe("2026-11-05");
    expect(calendarDate("2026-11-05T00:00:00+00:00")).toBe("2026-11-05");
    expect(calendarDate("2028-02-29")).toBe("2028-02-29");
  });

  it("is null for anything that isn't a real date", () => {
    // Date.parse rolls these over (Feb 30 is Mar 2) instead of refusing them.
    expect(calendarDate("2026-02-29")).toBeNull();
    expect(calendarDate("2026-02-30")).toBeNull();
    expect(calendarDate("2026-13-45")).toBeNull();
    expect(calendarDate("not-a-date")).toBeNull();
    expect(calendarDate("")).toBeNull();
    expect(calendarDate(null)).toBeNull();
    expect(calendarDate(undefined)).toBeNull();
  });
});

describe("sessionSpan", () => {
  const span = (sessionDate: string, starts: (string | null)[], ends: (string | null)[]) => {
    const s = sessionSpan(sessionDate, starts, ends);
    return s && { start: s.start.toISOString(), end: s.end?.toISOString() ?? null };
  };

  it("runs from the earliest case start to the latest case end", () => {
    // 9-10 AM and 10-11 AM CST.
    expect(span("2026-11-05", ["16:00:00", "15:00:00"], ["17:00:00", "16:00:00"])).toEqual({
      start: "2026-11-05T15:00:00.000Z",
      end: "2026-11-05T17:00:00.000Z",
    });
  });

  it("keeps the first case of an evening session whose cases cross midnight UTC", () => {
    // 5-6 PM and 6-7 PM CST, stored 23:00-00:00 and 00:00-01:00. As text, "00:00"
    // sorts first, which started the span at the second case.
    const expected = { start: "2026-11-05T23:00:00.000Z", end: "2026-11-06T01:00:00.000Z" };
    expect(span("2026-11-05", ["23:00:00", "00:00:00"], ["00:00:00", "01:00:00"])).toEqual(expected);
    expect(span("2026-11-05", ["00:00:00", "23:00:00"], ["01:00:00", "00:00:00"])).toEqual(expected);
  });

  it("never ends before it starts", () => {
    // 4-5:30 PM and 6:30-8 PM CST, stored 22:00-23:30 and 00:30-02:00. As text this
    // ran from 6:30 PM to 5:30 PM.
    expect(span("2026-11-05", ["22:00:00", "00:30:00"], ["23:30:00", "02:00:00"])).toEqual({
      start: "2026-11-05T22:00:00.000Z",
      end: "2026-11-06T02:00:00.000Z",
    });
  });

  it("takes the latest end when only the ends cross midnight UTC", () => {
    // 2:30-5:30 PM and 5:30-7:30 PM CDT, stored 19:30-22:30 and 22:30-00:30.
    expect(span("2026-10-29", ["19:30:00", "22:30:00"], ["22:30:00", "00:30:00"])).toEqual({
      start: "2026-10-29T19:30:00.000Z",
      end: "2026-10-30T00:30:00.000Z",
    });
  });

  it("puts an end after Central midnight on the next day", () => {
    // 10 PM to 1 AM CDT.
    expect(span("2026-10-20", ["03:00:00"], ["06:00:00"])).toEqual({
      start: "2026-10-21T03:00:00.000Z",
      end: "2026-10-21T06:00:00.000Z",
    });
  });

  it("puts a case that starts after Central midnight on the next day too", () => {
    // 10-11:30 PM and 12-1 AM CDT. The 12 AM start, read on the session's date, is
    // the start of Oct 20: the session ran 23 hours, and paid for them.
    const expected = { start: "2026-10-21T03:00:00.000Z", end: "2026-10-21T06:00:00.000Z" };
    expect(span("2026-10-20", ["03:00:00", "05:00:00"], ["04:30:00", "06:00:00"])).toEqual(expected);
    expect(span("2026-10-20", ["05:00:00", "03:00:00"], ["06:00:00", "04:30:00"])).toEqual(expected);
  });

  it("reads an 11 PM case on the night the clocks go back as CST", () => {
    // 10-11 PM and 11-11:30 PM CST on Nov 1. 05:00 UTC is also 12 AM CDT that
    // morning, which is what the session's date alone would say.
    expect(span("2026-11-01", ["04:00:00", "05:00:00"], ["05:00:00", "05:30:00"])).toEqual({
      start: "2026-11-02T04:00:00.000Z",
      end: "2026-11-02T05:30:00.000Z",
    });
  });

  it("leaves a long day's cases where they are", () => {
    // 8-9 AM and 9-10 PM CDT, 13 hours apart.
    expect(span("2026-10-20", ["13:00:00", "02:00:00"], ["14:00:00", "03:00:00"])).toEqual({
      start: "2026-10-20T13:00:00.000Z",
      end: "2026-10-21T03:00:00.000Z",
    });
  });

  it("reads an end of 24:00 as midnight", () => {
    // 9 AM CST to 24:00 UTC, which is 6 PM CST.
    expect(span("2026-11-05", ["15:00:00"], ["24:00:00"])).toEqual({
      start: "2026-11-05T15:00:00.000Z",
      end: "2026-11-06T00:00:00.000Z",
    });
  });

  it("reads an evening on a clock-change Sunday with that evening's offset", () => {
    // 7-8 PM CST on Nov 1 and 7-8 PM CDT on Mar 14.
    expect(span("2026-11-01", ["01:00:00"], ["02:00:00"])).toEqual({
      start: "2026-11-02T01:00:00.000Z",
      end: "2026-11-02T02:00:00.000Z",
    });
    expect(span("2027-03-14", ["00:00:00"], ["01:00:00"])).toEqual({
      start: "2027-03-15T00:00:00.000Z",
      end: "2027-03-15T01:00:00.000Z",
    });
  });

  it("has no end without an end time, and is null without a start time", () => {
    expect(span("2026-11-05", ["16:00:00"], [])).toEqual({ start: "2026-11-05T16:00:00.000Z", end: null });
    expect(span("2026-11-05", [], ["17:00:00"])).toBeNull();
    expect(span("2026-11-05", [null, "garbage", "25:00"], ["17:00:00"])).toBeNull();
  });

  it("ignores times it cannot read", () => {
    expect(span("2026-11-05", ["garbage", "16:00:00"], [null, "17:00:00"])).toEqual({
      start: "2026-11-05T16:00:00.000Z",
      end: "2026-11-05T17:00:00.000Z",
    });
  });
});

describe("formatSessionSpan", () => {
  const shown = (sessionDate: string, starts: string[], ends: string[]) =>
    formatSessionSpan(sessionDate, starts, ends)?.replace(/\s/g, " ");

  afterEach(() => vi.useRealTimers());

  it("shows the whole session in Central Time, on its own date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    expect(shown("2026-11-05", ["16:00:00"], ["18:00:00"])).toBe("10:00 AM – 12:00 PM");
  });

  it("shows evening sessions that cross midnight UTC from their first case", () => {
    expect(shown("2026-11-05", ["23:00:00", "00:00:00"], ["00:00:00", "01:00:00"])).toBe("5:00 PM – 7:00 PM");
    expect(shown("2026-11-05", ["22:00:00", "00:30:00"], ["23:30:00", "02:00:00"])).toBe("4:00 PM – 8:00 PM");
    expect(shown("2026-10-29", ["19:30:00", "22:30:00"], ["22:30:00", "00:30:00"])).toBe("2:30 PM – 7:30 PM");
    expect(shown("2026-11-01", ["01:00:00"], ["02:00:00"])).toBe("7:00 PM – 8:00 PM");
  });

  it("shows sessions running past Central midnight from their first case", () => {
    expect(shown("2026-10-20", ["03:00:00", "05:00:00"], ["04:30:00", "06:00:00"])).toBe("10:00 PM – 1:00 AM");
    expect(shown("2026-11-01", ["04:00:00", "05:00:00"], ["05:00:00", "05:30:00"])).toBe("10:00 PM – 11:30 PM");
  });

  it("is null without both a start and an end time", () => {
    expect(formatSessionSpan("2026-11-05", ["16:00:00"], [])).toBeNull();
    expect(formatSessionSpan("2026-11-05", [], ["18:00:00"])).toBeNull();
    expect(formatSessionSpan("2026-11-05", [null], [undefined])).toBeNull();
  });
});

describe("utcTimeToLocal", () => {
  it("converts a daytime time on the session's date", () => {
    expect(utcTimeToLocal("2026-11-05", "16:00", "America/Chicago")).toBe("10:00");
    expect(utcTimeToLocal("2026-11-01", "16:00", "America/Chicago")).toBe("10:00");
    expect(utcTimeToLocal("2026-10-20", "15:00", "Asia/Kolkata")).toBe("20:30");
  });

  it("reads an evening on a clock-change Sunday with that evening's offset", () => {
    // 7 PM CST on Nov 1 is stored as 01:00. Read on Nov 1 it is still CDT, and
    // came out as 20:00, so saving the Reschedule form unchanged moved it to 8 PM.
    expect(utcTimeToLocal("2026-11-01", "01:00", "America/Chicago")).toBe("19:00");
    expect(utcTimeToLocal("2027-03-14", "00:00", "America/Chicago")).toBe("19:00");
    // The days either side were already right.
    expect(utcTimeToLocal("2026-10-31", "00:00", "America/Chicago")).toBe("19:00");
    expect(utcTimeToLocal("2026-11-02", "01:00", "America/Chicago")).toBe("19:00");
  });

  it("gives back the time it was saved from", () => {
    const saved: Array<[date: string, utc: string]> = [
      ["2026-11-01", "01:00"],
      ["2027-03-14", "00:00"],
      ["2026-10-20", "00:30"],
    ];
    for (const [date, utc] of saved) {
      const local = utcTimeToLocal(date, utc, "America/Chicago");
      expect(localToUTCTime(date, local, "America/Chicago")).toBe(`${utc}:00`);
    }
  });

  it("gives back the time it was saved from in any zone, so an unchanged Reschedule saves nothing new", () => {
    // The Reschedule form shows these times in the admin's own zone and saves them
    // back onto the session's date there. The first case is 9 PM CDT on Oct 24,
    // stored 02:00: read as its real instant, 02:00 GMT on Oct 25 after Britain's
    // clocks went back, a London admin's unchanged save stored 01:00 (8 PM CDT).
    const saved: Array<[date: string, utc: string, zone: string]> = [
      ["2026-10-24", "02:00", "Europe/London"],
      ["2026-10-24", "02:00", "Europe/Berlin"],
      ["2026-10-25", "18:00", "Europe/Berlin"],
      ["2026-10-31", "01:00", "Europe/London"],
      ["2026-11-01", "01:00", "America/Chicago"],
      ["2026-11-01", "01:00", "America/New_York"],
      ["2027-03-14", "00:00", "America/Los_Angeles"],
      ["2026-10-24", "15:00", "Asia/Kolkata"],
    ];
    for (const [date, utc, zone] of saved) {
      const local = utcTimeToLocal(date, utc, zone);
      expect(localToUTCTime(date, local, zone), `${zone} ${date} ${utc} -> ${local}`).toBe(`${utc}:00`);
    }
  });

  it("reads a date that doesn't exist like no date, rather than throwing", () => {
    expect(() => utcTimeToLocal("2026-13-45", "15:00", "America/Chicago")).not.toThrow();
  });
});
