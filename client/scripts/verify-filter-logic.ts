
import { combineCaseFilters, relaxFilters, FILTER_PRIORITY, applyCaseFilters } from "../lib/filter-utils";

// Mock Data
const case1 = {
  id: "1",
  filters: {
    political_affiliation: ["Republican"],
    age: { min: 20, max: 50 }
  }
};

const case2 = {
  id: "2",
  filters: {
    political_affiliation: ["Democrat"],
    age: { min: 20, max: 50 }
  }
};

const case3 = {
    id: "3",
    filters: {} // Empty
}

console.log("--- Test Case 1: Single Case (Republican) ---");
const combined1 = combineCaseFilters([case1.filters]);
console.log("Combined:", JSON.stringify(combined1, null, 2));
const relaxed0 = relaxFilters(combined1, 0);
console.log("Relaxed Level 0:", JSON.stringify(relaxed0, null, 2));

// Mock Query Builder
const mockQuery = {
    sql: [] as string[],
    in(col: string, val: any) { this.sql.push(`${col} IN [${val.join(', ')}]`); return this; },
    gte(col: string, val: any) { this.sql.push(`${col} >= ${val}`); return this; },
    lte(col: string, val: any) { this.sql.push(`${col} <= ${val}`); return this; },
    eq(col: string, val: any) { this.sql.push(`${col} = ${val}`); return this; },
    limit() { return this; },
    not() { return this; },
    select() { return this; }
};

console.log("\n--- Apply Filters Check (Level 0, Case 1) ---");
mockQuery.sql = [];
applyCaseFilters(mockQuery, relaxed0);
console.log("Applied Filters:", mockQuery.sql);

console.log("\n--- Apply Filters Check (Level 7 - Relaxed All?, Case 1) ---");
// FILTER_PRIORITY length is 7?
// "political_affiliation" is LAST in priority list (index 6, if 0-indexed?)
// relaxFilters(filters, level).
// If level = 7 (greater than max index), it should remove ALL filters?
// FILTER_PRIORITY = ["location", "age", "race", "gender", "socioeconomic", "eligibility", "political_affiliation"]
// Length = 7.
// relaxFilters loop: i < level && i < 7.
// If level = 7: i goes 0..6.
// i=6 -> removes FILTER_PRIORITY[6] ("political_affiliation").
// So Level 7 should have NO filters.
// Level 6 (i < 6) -> 0..5. Key[6] is preserved.
// So Level 6 should KEEP political_affiliation.

const relaxed6 = relaxFilters(combined1, 6);
console.log("Relaxed Level 6:", JSON.stringify(relaxed6, null, 2));
mockQuery.sql = [];
applyCaseFilters(mockQuery, relaxed6);
console.log("Applied Filters Level 6:", mockQuery.sql);

const relaxed7 = relaxFilters(combined1, 7);
console.log("Relaxed Level 7:", JSON.stringify(relaxed7, null, 2));
mockQuery.sql = [];
applyCaseFilters(mockQuery, relaxed7);
console.log("Applied Filters Level 7:", mockQuery.sql);
