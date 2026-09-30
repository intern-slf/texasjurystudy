import { describe, it, expect } from "vitest";
import {
  ageOn,
  dateOfBirthError,
  isUnderage,
  todayIso,
  MINIMUM_AGE,
  UNDERAGE_MESSAGE,
} from "@/lib/age-gate";

// Local-time constructor so results don't depend on the machine's timezone.
const TODAY = new Date(2026, 8, 29); // 2026-09-29

describe("ageOn", () => {
  it("counts a birthday that has already happened this year", () => {
    expect(ageOn("2000-01-15", TODAY)).toBe(26);
  });

  it("does not count a birthday later this year", () => {
    expect(ageOn("2000-12-01", TODAY)).toBe(25);
  });

  it("counts the birthday itself", () => {
    expect(ageOn("2008-09-29", TODAY)).toBe(18);
  });

  it("is one short the day before the birthday", () => {
    expect(ageOn("2008-09-30", TODAY)).toBe(17);
  });

  it("treats a Feb 29 birthday as reached on Mar 1 in non-leap years", () => {
    expect(ageOn("2008-02-29", new Date(2026, 1, 28))).toBe(17);
    expect(ageOn("2008-02-29", new Date(2026, 2, 1))).toBe(18);
  });

  it("rejects dates that don't exist", () => {
    expect(ageOn("2001-02-29", TODAY)).toBeNull();
    expect(ageOn("2000-13-01", TODAY)).toBeNull();
    expect(ageOn("2000-04-31", TODAY)).toBeNull();
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(ageOn("", TODAY)).toBeNull();
    expect(ageOn("09/29/2000", TODAY)).toBeNull();
    expect(ageOn("2000-9-29", TODAY)).toBeNull();
    expect(ageOn("2000-09-29T00:00:00Z", TODAY)).toBeNull();
  });
});

describe("dateOfBirthError", () => {
  it("accepts someone who turns 18 today", () => {
    expect(dateOfBirthError("2008-09-29", TODAY)).toBeNull();
  });

  it(`rejects someone one day short of ${MINIMUM_AGE}`, () => {
    expect(dateOfBirthError("2008-09-30", TODAY)).toBe(UNDERAGE_MESSAGE);
  });

  it("rejects a child under 13 (the COPPA threshold)", () => {
    expect(dateOfBirthError("2016-05-01", TODAY)).toBe(UNDERAGE_MESSAGE);
  });

  it("asks for a date when none is given", () => {
    expect(dateOfBirthError("", TODAY)).toMatch(/enter your date of birth/);
    expect(dateOfBirthError(null, TODAY)).toMatch(/enter your date of birth/);
    expect(dateOfBirthError(undefined, TODAY)).toMatch(/enter your date of birth/);
  });

  it("rejects future dates and implausible ages as invalid, not underage", () => {
    expect(dateOfBirthError("2027-01-01", TODAY)).toMatch(/valid date of birth/);
    expect(dateOfBirthError("1900-01-01", TODAY)).toMatch(/valid date of birth/);
    expect(dateOfBirthError("not-a-date", TODAY)).toMatch(/valid date of birth/);
  });
});

// An underage date deletes the account, so anything that is merely a bad date must not count.
describe("isUnderage", () => {
  it("is true one day short of 18 and for a child under 13", () => {
    expect(isUnderage("2008-09-30", TODAY)).toBe(true);
    expect(isUnderage("2016-05-01", TODAY)).toBe(true);
  });

  it("is false for someone who turns 18 today", () => {
    expect(isUnderage("2008-09-29", TODAY)).toBe(false);
  });

  it("is false for missing, malformed, future and implausible dates", () => {
    for (const dob of ["", null, undefined, "2001-02-29", "not-a-date", "2027-01-01", "1900-01-01"]) {
      expect(isUnderage(dob, TODAY)).toBe(false);
    }
  });
});

describe("todayIso", () => {
  it("formats the local date zero-padded for a date input's max", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
