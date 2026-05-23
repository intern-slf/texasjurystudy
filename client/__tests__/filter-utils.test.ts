import { describe, it, expect } from "vitest";
import {
  applyCaseFilters,
  combineCaseFilters,
  relaxFilters,
  type CaseFilters,
} from "@/lib/filter-utils";

class MockQueryBuilder {
  filters: Record<string, unknown[]> = {};

  in(column: string, values: readonly string[]) {
    this.filters[column] = ["in", values];
    return this;
  }
  gte(column: string, value: string) {
    this.filters[`${column}_gte`] = ["gte", value];
    return this;
  }
  lte(column: string, value: string) {
    this.filters[`${column}_lte`] = ["lte", value];
    return this;
  }
  eq(column: string, value: string) {
    this.filters[column] = ["eq", value];
    return this;
  }
  ilike(column: string, pattern: string) {
    this.filters[column] = ["ilike", pattern];
    return this;
  }
  or(filter: string) {
    this.filters[`__or_${Object.keys(this.filters).length}`] = ["or", filter];
    return this;
  }
}

describe("applyCaseFilters", () => {
  it("translates age range to date_of_birth gte/lte date strings", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { age: { min: 25, max: 45 } });

    const minDOB = query.filters["date_of_birth_gte"]?.[1] as string;
    const maxDOB = query.filters["date_of_birth_lte"]?.[1] as string;

    expect(typeof minDOB).toBe("string");
    expect(minDOB).toHaveLength(10);
    expect(typeof maxDOB).toBe("string");
    expect(maxDOB).toHaveLength(10);
    expect(minDOB < maxDOB).toBe(true);
  });

  it("applies gender as an IN clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { gender: ["Male", "im-gender-fluid"] });

    expect(query.filters["gender"]).toEqual(["in", ["Male", "im-gender-fluid"]]);
  });

  it("applies location.state as an IN clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { location: { state: ["Texas", "California"] } });

    expect(query.filters["state"]).toEqual(["in", ["Texas", "California"]]);
  });

  it("applies education_level as an IN clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { socioeconomic: { education_level: ["PhD"] } });

    expect(query.filters["education_level"]).toEqual(["in", ["PhD"]]);
  });

  it("applies race as an IN clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { race: ["Asian", "Hispanic"] });

    expect(query.filters["race"]).toEqual(["in", ["Asian", "Hispanic"]]);
  });

  it("applies political_affiliation as an IN clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, { political_affiliation: ["Independent"] });

    expect(query.filters["political_affiliation"]).toEqual(["in", ["Independent"]]);
  });

  it("applies each explicit eligibility field as an EQ clause", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, {
      eligibility: {
        served_on_jury: "No",
        has_children: "Yes",
        served_armed_forces: "No",
        currently_employed: "Yes",
      },
    });

    expect(query.filters["served_on_jury"]?.[1]).toBe("No");
    expect(query.filters["has_children"]?.[1]).toBe("Yes");
    expect(query.filters["served_armed_forces"]?.[1]).toBe("No");
    expect(query.filters["currently_employed"]?.[1]).toBe("Yes");
  });

  it("ignores eligibility values of 'Any'", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, {
      eligibility: { served_on_jury: "Any", has_children: "Any" },
    });

    expect(query.filters["served_on_jury"]).toBeUndefined();
    expect(query.filters["has_children"]).toBeUndefined();
  });

  it("applies socioeconomic and availability mapping", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, {
      socioeconomic: {
        marital_status: ["Single"],
        family_income: ["$40k+"],
        availability: ["Weekdays"],
      },
    });

    expect(query.filters["marital_status"]).toEqual(["in", ["Single"]]);
    expect(query.filters["family_income"]).toEqual(["in", ["$40k+"]]);
    expect(query.filters["availability_weekdays"]?.[1]).toBe("Yes");
    expect(query.filters["availability_weekends"]).toBeUndefined();
  });

  it("applies no filters when the input is empty", () => {
    const query = new MockQueryBuilder();
    applyCaseFilters(query, {});

    expect(Object.keys(query.filters)).toHaveLength(0);
  });
});

describe("combineCaseFilters", () => {
  it("returns undefined for an eligibility field where cases conflict (Yes + No)", () => {
    const a: CaseFilters = { eligibility: { served_on_jury: "Yes" } };
    const b: CaseFilters = { eligibility: { served_on_jury: "No" } };

    const combined = combineCaseFilters([a, b]);

    expect(combined.eligibility?.served_on_jury).toBeUndefined();
  });

  it("preserves an eligibility field where cases agree (Yes + Yes)", () => {
    const a: CaseFilters = { eligibility: { served_on_jury: "Yes" } };
    const b: CaseFilters = { eligibility: { served_on_jury: "Yes" } };

    const combined = combineCaseFilters([a, b]);

    expect(combined.eligibility?.served_on_jury).toBe("Yes");
  });

  it("unions state arrays across cases", () => {
    const a: CaseFilters = { location: { state: ["TX"] } };
    const b: CaseFilters = { location: { state: ["CA"] } };

    const combined = combineCaseFilters([a, b]);

    expect(combined.location?.state).toContain("TX");
    expect(combined.location?.state).toContain("CA");
  });

  it("collects age ranges from each case into ageRanges", () => {
    const a: CaseFilters = { age: { min: 25, max: 40 } };
    const b: CaseFilters = { age: { min: 35, max: 55 } };

    const combined = combineCaseFilters([a, b]);

    expect(combined.ageRanges).toBeDefined();
    expect(combined.ageRanges).toHaveLength(2);
  });
});

describe("relaxFilters", () => {
  const fullFilters: CaseFilters = {
    gender: ["Male"],
    race: ["Asian"],
    age: { min: 20, max: 30 },
    political_affiliation: ["Democrat"],
    location: { state: ["TX"] },
    socioeconomic: { education_level: ["PhD"] },
    eligibility: { us_citizen: "Yes" },
  };

  it("level 0 keeps everything", () => {
    const relaxed = relaxFilters(fullFilters, 0);
    expect(relaxed.location).toBeDefined();
  });

  it("level 1 drops the lowest-priority filter (location)", () => {
    const relaxed = relaxFilters(fullFilters, 1);
    expect(relaxed.location).toBeUndefined();
    expect(relaxed.age).toBeDefined();
  });

  it("level 2 also drops age", () => {
    const relaxed = relaxFilters(fullFilters, 2);
    expect(relaxed.age).toBeUndefined();
    expect(relaxed.race).toBeDefined();
  });

  it("level 6 still keeps political_affiliation (it is last in priority)", () => {
    const relaxed = relaxFilters(fullFilters, 6);
    expect(relaxed.political_affiliation).toBeDefined();
  });

  it("level beyond the priority list drops political_affiliation too", () => {
    const relaxed = relaxFilters(fullFilters, 10);
    expect(relaxed.political_affiliation).toBeUndefined();
  });
});
