import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assertPaidTime,
  caseMinutes,
  endTimeChoices,
  formatMinutes,
  paidMinutes,
  paidTimeProblem,
  storedCaseMinutes,
} from "@/lib/case/paidTime";
import CaseTimeInputs from "@/components/CaseTimeInputs";

/* ---------------------------------------------------------------------------
   A case runs no longer than its firm paid for (lib/case/paidTime.ts): the
   hours it asked for, or 1 hour when it left that empty, as the receipt prices
   it. The server actions that set case times are pinned in sessions.test.ts;
   these are the rule and the Build Session picker.
--------------------------------------------------------------------------- */

describe("paidMinutes", () => {
  it("is the hours asked for, or 1 hour when that is empty", () => {
    expect(paidMinutes(3)).toBe(180);
    expect(paidMinutes(1.5)).toBe(90);
    for (const empty of [null, undefined, 0]) expect(paidMinutes(empty)).toBe(60);
  });
});

describe("formatMinutes", () => {
  it("says hours and minutes in words", () => {
    expect(formatMinutes(30)).toBe("30 minutes");
    expect(formatMinutes(60)).toBe("1 hour");
    expect(formatMinutes(120)).toBe("2 hours");
    expect(formatMinutes(90)).toBe("1 hour 30 minutes");
    expect(formatMinutes(61)).toBe("1 hour 1 minute");
  });
});

describe("how long a case runs", () => {
  it("from the Central times an admin types", () => {
    expect(caseMinutes("2026-06-15", "09:00", "12:00")).toBe(180);
    expect(caseMinutes("2026-06-15", "09:00", "10:30")).toBe(90);
  });

  it("past midnight, as the pickers wrap", () => {
    expect(caseMinutes("2026-06-15", "23:30", "00:30")).toBe(60);
  });

  it("in real time on the nights the clocks change", () => {
    // 1-3 AM on the morning the clocks go forward is one hour.
    expect(caseMinutes("2027-03-14", "01:00", "03:00")).toBe(60);
    // 12:30-2:30 AM on the morning they go back is three.
    expect(caseMinutes("2026-11-01", "00:30", "02:30")).toBe(180);
  });

  it("is 0 when the end is the start, and null when a time can't be read", () => {
    expect(caseMinutes("2026-06-15", "09:00", "09:00")).toBe(0);
    expect(caseMinutes("2026-06-15", "9am", "10:00")).toBeNull();
    expect(caseMinutes("2026-06-15", "09:00", "")).toBeNull();
    // Only what the writers convert: seconds or spaces would pass here and then
    // crash the write, after Build Session had created the session.
    expect(caseMinutes("2026-06-15", "09:00:00", "10:00")).toBeNull();
    expect(caseMinutes("2026-06-15", " 09:00", "10:00")).toBeNull();
    expect(caseMinutes("not a date", "09:00", "10:00")).toBeNull();
  });

  it("from the stored UTC times, across midnight UTC", () => {
    // 7:30-9 PM CDT on Oct 20, stored on the next UTC day.
    expect(storedCaseMinutes("2026-10-20", "00:30:00", "02:00:00")).toBe(90);
    expect(storedCaseMinutes("2026-10-20", "", "")).toBeNull();
  });
});

describe("paidTimeProblem", () => {
  it("allows any length up to what the case is paid for", () => {
    expect(paidTimeProblem("Smith v. Jones", 120, 2)).toBeNull();
    expect(paidTimeProblem("Smith v. Jones", 30, 2)).toBeNull();
    expect(paidTimeProblem("Smith v. Jones", 60, null)).toBeNull();
  });

  it("refuses longer, saying what was paid for", () => {
    expect(paidTimeProblem("Smith v. Jones", 150, 2)).toBe(
      '"Smith v. Jones" is paid for 2 hours, so it can\'t run 2 hours 30 minutes.',
    );
    expect(paidTimeProblem("Smith v. Jones", 90, null)).toBe(
      '"Smith v. Jones" is paid for 1 hour, so it can\'t run 1 hour 30 minutes.',
    );
  });

  it("lets a case keep a longer length it already had, but no more", () => {
    expect(paidTimeProblem("Smith v. Jones", 120, 1, 120)).toBeNull();
    expect(paidTimeProblem("Smith v. Jones", 150, 1, 120)).toMatch(/paid for 1 hour/);
  });

  it("refuses a time that is nothing, or can't be read", () => {
    expect(paidTimeProblem("Smith v. Jones", 0, 2)).toBe('"Smith v. Jones" has to end after it starts.');
    expect(paidTimeProblem("Smith v. Jones", null, 2)).toBe('The times for "Smith v. Jones" could not be read.');
  });

  it("throws the same message for the server actions", () => {
    expect(() => assertPaidTime("Smith v. Jones", 150, 2)).toThrow(/paid for 2 hours/);
    expect(() => assertPaidTime("Smith v. Jones", 120, 2)).not.toThrow();
  });
});

describe("Build Session's end times", () => {
  it("run every half hour up to the paid length", () => {
    expect(endTimeChoices("09:00", 2)).toEqual([
      { value: "09:30", minutes: 30 },
      { value: "10:00", minutes: 60 },
      { value: "10:30", minutes: 90 },
      { value: "11:00", minutes: 120 },
    ]);
    expect(endTimeChoices("23:30", null).map((c) => c.value)).toEqual(["00:00", "00:30"]);
  });

  it("end on the paid length when it isn't a whole half hour", () => {
    expect(endTimeChoices("09:00", 1.25).map((c) => c.value)).toEqual(["09:30", "10:00", "10:15"]);
  });

  it("are none until there is a start", () => {
    expect(endTimeChoices("", 2)).toEqual([]);
  });

  it("start out as a closed picker that says what the case is paid for", () => {
    const html = renderToStaticMarkup(createElement(CaseTimeInputs, { caseId: "c1", hoursRequested: 2 }));
    expect(html).toContain('name="end_c1"');
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).toContain("Paid for 2 hours, so it can&#x27;t run longer.");
  });
});
