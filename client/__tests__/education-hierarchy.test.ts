import { describe, it, expect } from "vitest";
import {
  EDUCATION_LEVELS,
  applyEducationAutoSelect,
} from "@/lib/education-hierarchy";

describe("applyEducationAutoSelect", () => {
  it("selecting the lowest level adds every level (option + all above)", () => {
    const result = applyEducationAutoSelect("Less than High School", []);
    expect(result).toEqual([...EDUCATION_LEVELS]);
  });

  it("selecting the highest level adds only that level", () => {
    const result = applyEducationAutoSelect("Graduate Degree", []);
    expect(result).toEqual(["Graduate Degree"]);
  });

  it("selecting a middle level adds that level and every level above it", () => {
    const result = applyEducationAutoSelect("Some College", []);
    expect(result).toEqual(["Some College", "Bachelor Degree", "Graduate Degree"]);
  });

  it("deselecting a level removes that level and every level above it", () => {
    const current = [...EDUCATION_LEVELS];
    const result = applyEducationAutoSelect("Bachelor Degree", current);
    expect(result).toEqual([
      "Less than High School",
      "High School or GED",
      "Associate's or Technical Degree",
      "Some College",
    ]);
  });

  it("deselecting the lowest level clears every level", () => {
    const result = applyEducationAutoSelect(
      "Less than High School",
      [...EDUCATION_LEVELS]
    );
    expect(result).toEqual([]);
  });

  it("deduplicates when selecting a level whose ancestors are already present", () => {
    const result = applyEducationAutoSelect("Some College", [
      "Bachelor Degree",
      "Graduate Degree",
    ]);
    expect(result).toEqual(["Bachelor Degree", "Graduate Degree", "Some College"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns the input unchanged when the option is not a known level", () => {
    const current = ["Bachelor Degree"];
    const result = applyEducationAutoSelect("PhD (unknown)", current);
    expect(result).toEqual(current);
  });

  it("EDUCATION_LEVELS is ordered low → high", () => {
    expect(EDUCATION_LEVELS[0]).toBe("Less than High School");
    expect(EDUCATION_LEVELS[EDUCATION_LEVELS.length - 1]).toBe("Graduate Degree");
  });
});
