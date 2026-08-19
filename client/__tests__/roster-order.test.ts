import { describe, it, expect } from "vitest";
import {
  rosterGroup,
  rosterStatusLabel,
  sortRoster,
  compareRosterEntries,
  ROSTER_GROUP_ORDER,
} from "@/lib/participant/rosterOrder";

/* ---------------------------------------------------------------------------
   The order every participant list in the app renders in. Asserted here rather
   than through a page because five screens share this comparator and would
   otherwise drift apart.
--------------------------------------------------------------------------- */

type Row = { name: string; inviteStatus?: string | null; struck?: boolean };
const read = (r: Row) => r;
const names = (rows: Row[]) => sortRoster(rows, read).map((r) => r.name);

describe("rosterGroup", () => {
  it("buckets each invite status", () => {
    expect(rosterGroup("accepted")).toBe("accepted");
    expect(rosterGroup("declined")).toBe("declined");
    expect(rosterGroup("pending")).toBe("pending");
  });

  it("treats the legacy 'rejected' spelling as declined", () => {
    expect(rosterGroup("rejected")).toBe("declined");
  });

  it("reads null and unknown statuses as pending", () => {
    expect(rosterGroup(null)).toBe("pending");
    expect(rosterGroup(undefined)).toBe("pending");
    expect(rosterGroup("something-else")).toBe("pending");
  });

  it("lets a strike outrank the status it was applied to", () => {
    // They accepted and then backed out, so they are not among those coming.
    expect(rosterGroup("accepted", true)).toBe("struck");
    expect(rosterGroup("pending", true)).toBe("struck");
    expect(rosterGroup(null, true)).toBe("struck");
  });
});

describe("rosterStatusLabel", () => {
  it("labels every group", () => {
    expect(rosterStatusLabel("accepted")).toBe("Accepted");
    expect(rosterStatusLabel("declined")).toBe("Declined");
    expect(rosterStatusLabel("pending")).toBe("Pending");
    expect(rosterStatusLabel(null)).toBe("Pending");
    expect(rosterStatusLabel("accepted", true)).toBe("Struck");
  });
});

describe("sortRoster", () => {
  it("orders accepted → declined → pending → struck", () => {
    const rows: Row[] = [
      { name: "Anna Struck", inviteStatus: "accepted", struck: true },
      { name: "Anna Pending", inviteStatus: "pending" },
      { name: "Anna Declined", inviteStatus: "declined" },
      { name: "Anna Accepted", inviteStatus: "accepted" },
    ];

    expect(names(rows)).toEqual([
      "Anna Accepted",
      "Anna Declined",
      "Anna Pending",
      "Anna Struck",
    ]);
  });

  it("matches the declared group order", () => {
    expect(ROSTER_GROUP_ORDER).toEqual(["accepted", "declined", "pending", "struck"]);
  });

  it("sorts alphabetically inside a group, not across groups", () => {
    // Zoe accepted, so she outranks Adam even though 'A' sorts before 'Z'.
    const rows: Row[] = [
      { name: "Adam Blake", inviteStatus: "declined" },
      { name: "Zoe Adams", inviteStatus: "accepted" },
      { name: "Aaron Cole", inviteStatus: "declined" },
    ];

    expect(names(rows)).toEqual(["Zoe Adams", "Aaron Cole", "Adam Blake"]);
  });

  it("sorts on the displayed 'First Last' string", () => {
    // The five names from the admin roster, all declined — one group, so this
    // is purely the lexicographic rule, keyed on first name as rendered.
    const rows: Row[] = [
      "Lisa Lyon",
      "Lakisha Richardson",
      "Julie Simons",
      "Brunilda Carley",
      "William Jaques",
    ].map((name) => ({ name, inviteStatus: "declined" }));

    expect(names(rows)).toEqual([
      "Brunilda Carley",
      "Julie Simons",
      "Lakisha Richardson",
      "Lisa Lyon",
      "William Jaques",
    ]);
  });

  it("does not mutate the input array", () => {
    const rows: Row[] = [
      { name: "Zoe Adams", inviteStatus: "declined" },
      { name: "Adam Blake", inviteStatus: "accepted" },
    ];
    const snapshot = [...rows];

    sortRoster(rows, read);

    expect(rows).toEqual(snapshot);
  });

  it("keeps equal entries stable", () => {
    const rows: Row[] = [
      { name: "Same Name", inviteStatus: "pending" },
      { name: "Same Name", inviteStatus: "pending" },
    ];
    expect(compareRosterEntries(rows[0], rows[1])).toBe(0);
  });

  it("handles an empty roster", () => {
    expect(names([])).toEqual([]);
  });
});
