import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  centralDateTimeInput,
  centralDateTimeToISO,
  formatCentralClock,
  formatCentralDate,
  formatCentralDateTime,
  formatSessionDate,
} from "@/lib/timezone";
import { caseSessionTime } from "@/lib/case/caseSessionTime";
import { deadlineForTimeframe } from "@/lib/case/deadline";
import CentralTimeRange from "@/components/CentralTimeRange";

/* ---------------------------------------------------------------------------
   Admin and firm screens show times in Central Time, labelled CT, as the
   emails and participant pages already did. They used to format in whatever
   zone the code ran in: UTC in a server component, the viewer's own zone in a
   client one, with no label either way.
--------------------------------------------------------------------------- */

/** ICU puts a narrow no-break space before AM/PM. */
const plain = (value: string | null | undefined) => value?.replace(/\s/g, " ") ?? value;

/** Run with the process in another zone, as a browser there or a non-UTC server would be. */
const originalTz = process.env.TZ;
const inZone = (zone: string) => {
  process.env.TZ = zone;
};
// UTC unless a test says otherwise, as the server runs: on a machine set to
// Central Time, a formatter that lost its Central zone would still pass.
beforeEach(() => inZone("UTC"));
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("formatSessionDate", () => {
  it("formats a session date long or short", () => {
    expect(formatSessionDate("2026-11-05")).toBe("Thursday, November 5, 2026");
    expect(formatSessionDate("2026-11-05", "short")).toBe("Nov 5, 2026");
  });

  it("is the same date in a Texas browser, where new Date() put it the day before", () => {
    inZone("America/Chicago");
    expect(new Date("2026-11-05").toLocaleDateString("en-US")).toBe("11/4/2026");
    expect(formatSessionDate("2026-11-05", "short")).toBe("Nov 5, 2026");
  });

  it("passes text that isn't a date through, so formatted text can be passed again", () => {
    expect(formatSessionDate("Thursday, November 5, 2026")).toBe("Thursday, November 5, 2026");
    expect(formatSessionDate("2026-02-30")).toBe("2026-02-30");
    expect(formatSessionDate(null)).toBe("");
  });
});

describe("Central formatting of stored instants", () => {
  it("shows a time on the Central clock, labelled, in any zone", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
      inZone(zone);
      // 10 AM CST. A server component showed it as 4:00 PM.
      expect(plain(formatCentralDateTime("2026-11-05T16:00:00Z"))).toBe("Nov 5, 2026, 10:00 AM CT");
      expect(plain(formatCentralClock("2026-11-05T16:00:00Z"))).toBe("10:00 AM CT");
    }
  });

  it("keeps an evening time on its own Central day", () => {
    // 7 PM CST on Nov 5 is already Nov 6 in UTC.
    expect(plain(formatCentralDateTime("2026-11-06T01:00:00Z"))).toBe("Nov 5, 2026, 7:00 PM CT");
    expect(formatCentralDate("2026-11-06T01:00:00Z")).toBe("Nov 5, 2026");
  });

  it("follows daylight saving time", () => {
    expect(plain(formatCentralDateTime("2026-10-20T15:00:00Z"))).toBe("Oct 20, 2026, 10:00 AM CT");
  });

  it("dates a deadline of 11:59 PM CT on its own day", () => {
    // "Within a Week" from Oct 14 is Oct 21, 11:59 PM CDT: 04:59 UTC on Oct 22.
    expect(formatCentralDate("2026-10-22T04:59:00Z")).toBe("Oct 21, 2026");
  });

  it("returns null for a value it can't read", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(formatCentralDateTime(value)).toBeNull();
      expect(formatCentralDate(value)).toBeNull();
      expect(formatCentralClock(value)).toBeNull();
    }
  });
});

describe("the firm's Central datetime-local field", () => {
  it("prefills on the Central clock", () => {
    inZone("UTC"); // as the server renders it
    expect(centralDateTimeInput("2026-11-05T16:00:00Z")).toBe("2026-11-05T10:00");
    expect(centralDateTimeInput("2026-11-06T01:00:00Z")).toBe("2026-11-05T19:00");
    expect(centralDateTimeInput(null)).toBe("");
  });

  it("saves what it shows as Central Time", () => {
    inZone("UTC"); // as the server action runs
    expect(centralDateTimeToISO("2026-11-05T10:00")).toBe("2026-11-05T16:00:00.000Z");
    expect(centralDateTimeToISO("2026-10-20T10:00")).toBe("2026-10-20T15:00:00.000Z");
    expect(centralDateTimeToISO("2026-11-05T10:00:00")).toBe("2026-11-05T16:00:00.000Z");
  });

  it("saves an untouched form as the time it had", () => {
    // The old field showed UTC and saved the typed time as UTC: an untouched
    // save kept the instant, but setting it back to the 10 AM the firm chose
    // stored 4 AM.
    for (const stored of ["2026-11-05T16:00:00.000Z", "2026-11-06T01:00:00.000Z", "2026-03-08T09:00:00.000Z"]) {
      expect(centralDateTimeToISO(centralDateTimeInput(stored))).toBe(stored);
    }
  });

  it("refuses anything that isn't a date and time", () => {
    for (const value of [null, "", "2026-11-05", "2026-02-30T10:00", "2026-11-05T24:00", "10:00", "garbage"]) {
      expect(centralDateTimeToISO(value)).toBeNull();
    }
  });
});

describe("caseSessionTime", () => {
  const row = (session_date: string, start_time: string, end_time: string) => ({
    start_time,
    end_time,
    sessions: { session_date },
  });

  it("is when the case starts and ends, not admin_scheduled_at's end", () => {
    // 10-11 AM CST, stored 16:00-17:00. The firm's dashboard showed the case's
    // admin_scheduled_at, its END, as "Scheduled Session Date: 11:00 AM".
    const t = caseSessionTime([row("2026-11-05", "16:00:00", "17:00:00")])!;
    expect(t.sessionDate).toBe("2026-11-05");
    expect(t.start.toISOString()).toBe("2026-11-05T16:00:00.000Z");
    expect(t.end?.toISOString()).toBe("2026-11-05T17:00:00.000Z");
    expect(plain(t.time)).toBe("10:00 AM – 11:00 AM CT");
  });

  it("puts an evening case on its session's Central date", () => {
    // 7-8 PM CST, stored on the next UTC day.
    const t = caseSessionTime([row("2026-11-05", "01:00:00", "02:00:00")])!;
    expect(t.start.toISOString()).toBe("2026-11-06T01:00:00.000Z");
    expect(plain(t.time)).toBe("7:00 PM – 8:00 PM CT");
  });

  it("reads the session embedded as an array too, and takes the latest session", () => {
    const later = { start_time: "16:00:00", end_time: "17:00:00", sessions: [{ session_date: "2026-11-12" }] };
    const earlier = row("2026-11-05", "15:00:00", "16:00:00");
    expect(caseSessionTime([later, earlier])?.sessionDate).toBe("2026-11-12");
    expect(caseSessionTime([earlier, later])?.sessionDate).toBe("2026-11-12");
  });

  it("is null without a session date and a start time", () => {
    expect(caseSessionTime(null)).toBeNull();
    expect(caseSessionTime([])).toBeNull();
    expect(caseSessionTime([{ start_time: "16:00:00", end_time: "17:00:00", sessions: null }])).toBeNull();
    expect(caseSessionTime([row("2026-11-05", "", "")])).toBeNull();
  });

  it("has no time text without an end", () => {
    const t = caseSessionTime([row("2026-11-05", "16:00:00", "")])!;
    expect(t.end).toBeNull();
    expect(t.time).toBeNull();
  });
});

describe("deadlineForTimeframe", () => {
  it("is 11:59 PM Central that many days after today in Central", () => {
    expect(deadlineForTimeframe("Within a Week", new Date("2026-10-14T15:00:00Z"))).toBe(
      "2026-10-22T04:59:00.000Z", // Oct 21, 11:59 PM CDT
    );
  });

  it("counts from the Central date in the evening, when UTC is already tomorrow", () => {
    // 8 PM CDT on Oct 14.
    expect(deadlineForTimeframe("Within a Week", new Date("2026-10-15T01:00:00Z"))).toBe(
      "2026-10-22T04:59:00.000Z",
    );
  });

  it("uses the offset on the deadline's own date", () => {
    // Oct 28 + 7 is Nov 4, after the clocks go back: 11:59 PM CST.
    expect(deadlineForTimeframe("Within a Week", new Date("2026-10-28T15:00:00Z"))).toBe(
      "2026-11-05T05:59:00.000Z",
    );
    expect(deadlineForTimeframe("Within 3 Months", new Date("2026-10-14T15:00:00Z"))).toBe(
      "2027-01-13T05:59:00.000Z",
    );
  });

  it("is null for any other answer", () => {
    for (const answer of [null, undefined, "", "Whenever", "constructor", "toString"]) {
      expect(deadlineForTimeframe(answer, new Date("2026-10-14T15:00:00Z"))).toBeNull();
    }
  });
});

describe("CentralTimeRange", () => {
  it("shows a case's times as Central clocks on its session's date", () => {
    inZone("Asia/Kolkata"); // an admin outside Texas saw 06:00 → 07:30
    const html = renderToStaticMarkup(
      createElement(CentralTimeRange, { sessionDate: "2026-10-20", startUtc: "00:30:00", endUtc: "02:00:00" }),
    );
    expect(plain(html)).toContain("7:30 PM – 9:00 PM CT");
  });

  it("says so when the times can't be read", () => {
    const html = renderToStaticMarkup(
      createElement(CentralTimeRange, { sessionDate: "2026-10-20", startUtc: "", endUtc: "" }),
    );
    expect(html).toContain("Time unreadable");
  });
});

/* The admin forms used to send the browser's zone with the times they saved.
   Times are entered in Central Time now, so nothing should read it again. */
describe("nothing reads the viewer's own time zone", () => {
  const CLIENT = fileURLToPath(new URL("..", import.meta.url));
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it("in app/, lib/ and components/", () => {
    const offenders = ["app", "lib", "components"]
      .flatMap((dir) => sourceFiles(join(CLIENT, dir)))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .flatMap((text, i) =>
            /resolvedOptions\(\)\.timeZone|getTimezoneOffset\(/.test(text)
              ? [`${relative(CLIENT, path).split(sep).join("/")}:${i + 1}  ${text.trim()}`]
              : [],
          ),
      );
    expect(offenders, "Session times are Central Time: use CENTRAL_TIME_ZONE from lib/timezone.").toEqual([]);
  });
});
