import { applyCaseFilters, CaseFilters } from "../lib/filter-utils";

class MockQueryBuilder {
  filters: Record<string, any[]> = {};

  in(column: string, values: any[]) {
    this.filters[column] = ["in", values];
    return this;
  }

  gte(column: string, value: any) {
    this.filters[`${column}_gte`] = ["gte", value];
    return this;
  }

  lte(column: string, value: any) {
    this.filters[`${column}_lte`] = ["lte", value];
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = ["eq", value];
    return this;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

function testGenderFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { gender: ["Male", "im-gender-fluid"] }; // check strictness
  
  applyCaseFilters(query, filters);
  
  assert(
    JSON.stringify(query.filters["gender"]) === JSON.stringify(["in", ["Male", "im-gender-fluid"]]),
    "Gender filter applied correctly"
  );
}

function testAgeFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { age: { min: 18, max: 25 } };
  
  applyCaseFilters(query, filters);
  
  assert(query.filters["age_gte"][1] === 18, "Age min filter applied");
  assert(query.filters["age_lte"][1] === 25, "Age max filter applied");
}

function testLocationFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { location: { state: ["Texas", "California"] } };
  
  applyCaseFilters(query, filters);
  
  assert(
    JSON.stringify(query.filters["state"]) === JSON.stringify(["in", ["Texas", "California"]]),
    "Location state filter applied"
  );
}

function testEducationFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { socioeconomic: { education_level: ["PhD"] } };
  
  applyCaseFilters(query, filters);
  
  assert(
    JSON.stringify(query.filters["education_level"]) === JSON.stringify(["in", ["PhD"]]),
    "Education level filter applied"
  );
}

function testEmptyFilter() {
    const query = new MockQueryBuilder();
    const filters: CaseFilters = {};
    
    applyCaseFilters(query, filters);
    
    assert(Object.keys(query.filters).length === 0, "Empty filters result in no query changes");
}


function testRaceFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { race: ["Asian", "Hispanic"] };
  
  applyCaseFilters(query, filters);
  
  assert(
    JSON.stringify(query.filters["race"]) === JSON.stringify(["in", ["Asian", "Hispanic"]]),
    "Race filter applied"
  );
}

function testPoliticalFilter() {
  const query = new MockQueryBuilder();
  const filters: CaseFilters = { political_affiliation: ["Independent"] };
  
  applyCaseFilters(query, filters);
  
  assert(
    JSON.stringify(query.filters["political_affiliation"]) === JSON.stringify(["in", ["Independent"]]),
    "Political affiliation filter applied"
  );
}

function testEligibilityFilters() {
    const query = new MockQueryBuilder();
    const filters: CaseFilters = { 
        eligibility: {
            served_on_jury: "No",
            convicted_felon: "No",
            us_citizen: "Yes",
            has_children: "Yes", // Should ignore "Any" if implemented that way, but here we test explicit values
            served_armed_forces: "No",
            currently_employed: "Yes",
            internet_access: "Yes"
        }
    };
    
    applyCaseFilters(query, filters);

    assert(query.filters["served_on_jury"][1] === "No", "Served on jury filter");
    assert(query.filters["convicted_felon"][1] === "No", "Convicted felon filter");
    assert(query.filters["us_citizen"][1] === "Yes", "US Citizen filter");
    assert(query.filters["has_children"][1] === "Yes", "Has children filter");
    assert(query.filters["served_armed_forces"][1] === "No", "Armed forces filter");
    assert(query.filters["currently_employed"][1] === "Yes", "Employed filter");
    assert(query.filters["internet_access"][1] === "Yes", "Internet access filter");
}

function testEligibilityAnyFilter() {
    const query = new MockQueryBuilder();
    // "Any" should NOT add a filter
    const filters: CaseFilters = { 
        eligibility: {
            served_on_jury: "Any",
            convicted_felon: "Any"
        }
    };
    
    applyCaseFilters(query, filters);

    assert(query.filters["served_on_jury"] === undefined, "Served on jury 'Any' ignored");
    assert(query.filters["convicted_felon"] === undefined, "Convicted felon 'Any' ignored");
}

function testSocioeconomicFilters() {
    const query = new MockQueryBuilder();
    const filters: CaseFilters = { 
        socioeconomic: {
            marital_status: ["Single"],
            family_income: ["$40k+"],
            availability: ["Weekdays"]
        }
    };
    
    applyCaseFilters(query, filters);

    assert(
        JSON.stringify(query.filters["marital_status"]) === JSON.stringify(["in", ["Single"]]),
        "Marital status filter"
    );
     assert(
        JSON.stringify(query.filters["family_income"]) === JSON.stringify(["in", ["$40k+"]]),
        "Family income filter"
    );
    // Availability mapping check
    assert(query.filters["availability_weekdays"][1] === "Yes", "Weekdays availability mapped");
    assert(query.filters["availability_weekends"] === undefined, "Weekends not requested, not filtered");
}


function testCombineFilters() {
    const { combineCaseFilters } = require("../lib/filter-utils");
    
    // Test 1: Conflict (Yes + No = Any)
    const filters1: CaseFilters = { eligibility: { served_on_jury: "Yes" } };
    const filters2: CaseFilters = { eligibility: { served_on_jury: "No" } };
    const combined = combineCaseFilters([filters1, filters2]);
    
    assert(combined.eligibility?.served_on_jury === undefined, "Conflict (Yes+No) results in Any (undefined)");

    // Test 2: Agreement (Yes + Yes = Yes)
    const filters3: CaseFilters = { eligibility: { us_citizen: "Yes" } };
    const filters4: CaseFilters = { eligibility: { us_citizen: "Yes" } };
    const combined2 = combineCaseFilters([filters3, filters4]);
    
    assert(combined2.eligibility?.us_citizen === "Yes", "Agreement (Yes+Yes) preserves filter");

    // Test 3: Arrays Union
    const filters5: CaseFilters = { location: { state: ["TX"] } };
    const filters6: CaseFilters = { location: { state: ["CA"] } };
    const combined3 = combineCaseFilters([filters5, filters6]);
    
    assert(combined3.location?.state?.includes("TX"), "Union includes TX");
    assert(combined3.location?.state?.includes("CA"), "Union includes CA");

    // Test 4: Age Range Widening
    const filters7: CaseFilters = { age: { min: 20, max: 30 } };
    const filters8: CaseFilters = { age: { min: 40, max: 50 } };
    const combined4 = combineCaseFilters([filters7, filters8]);

    assert(combined4.age?.min === 20, "Age min matches lowest");
    assert(combined4.age?.max === 50, "Age max matches highest");
}


function testRelaxFilters() {
    const { relaxFilters, FILTER_PRIORITY } = require("../lib/filter-utils");
    
    const fullFilters: CaseFilters = {
        gender: ["Male"],
        race: ["Asian"],
        political_affiliation: ["Democrat"],
        age: { min: 20, max: 30 },
        location: { state: ["TX"] },
        socioeconomic: { education_level: ["PhD"] },
        eligibility: { us_citizen: "Yes" }
    };

    // Level 0: No change
    const level0 = relaxFilters(fullFilters, 0);
    assert(level0.location !== undefined, "Level 0 keeps location");

    // Level 1: Drop Location (First in NEW priority list)
    const level1 = relaxFilters(fullFilters, 1);
    assert(level1.location === undefined, "Level 1 drops location");
    assert(level1.age !== undefined, "Level 1 keeps age");

    // Level 2: Drop Location + Age
    const level2 = relaxFilters(fullFilters, 2);
    assert(level2.location === undefined, "Level 2 drops location");
    assert(level2.age === undefined, "Level 2 drops age");
    assert(level2.race !== undefined, "Level 2 keeps race");
    
    // Check Political is still there (it's last)
    const levelMax = relaxFilters(fullFilters, 6); // Drop 6 things
    assert(levelMax.political_affiliation !== undefined, "Level 6 keeps political (dropped last)");
    
    const levelAll = relaxFilters(fullFilters, 10);
    assert(levelAll.political_affiliation === undefined, "Level 10 drops political");
}

console.log("Running Filter Tests...");
testRelaxFilters();
testCombineFilters();
testGenderFilter();
testAgeFilter();
testLocationFilter();
testEducationFilter();
testRaceFilter();
testPoliticalFilter();
testEligibilityFilters();
testEligibilityAnyFilter();
testSocioeconomicFilters();
testEmptyFilter();
console.log("All tests passed!");
