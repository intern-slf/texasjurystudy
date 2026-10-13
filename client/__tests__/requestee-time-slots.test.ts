import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import {
  SLOT_TIME_OPTIONS,
  datesToInstantRange,
  describeSlot,
  findOverlappingSlot,
  formatClockTime,
  formatMonthKey,
  formatSlotRange,
  isDateKey,
  isMonthKey,
  monthGridDates,
  planTimeSlots,
  shiftMonth,
  slotDateKey,
  type NewTimeSlotsInput,
} from "@/lib/requesteeTimeSlots";

// 2026-10-14 07:00 CDT. Every date below is after it unless a test says otherwise.
const NOW = Date.parse("2026-10-14T12:00:00Z");

const input = (overrides: Partial<NewTimeSlotsInput> = {}): NewTimeSlotsInput => ({
  date: "2026-10-20",
  start: "10:00",
  end: "12:00",
  weeks: 1,
  note: "",
  ...overrides,
});

// ---------------------------------------------------------------------------
// planTimeSlots: what the admin entered, turned into rows to save.
// ---------------------------------------------------------------------------
describe("planTimeSlots", () => {
  it("turns Central Time into instants (CDT is UTC-5 in October)", () => {
    expect(planTimeSlots(input(), NOW)).toEqual({
      ok: true,
      slots: [{ starts_at: "2026-10-20T15:00:00.000Z", ends_at: "2026-10-20T17:00:00.000Z", note: null }],
    });
  });

  it("repeats weekly and keeps the wall-clock time across the November changeover", () => {
    const plan = planTimeSlots(input({ date: "2026-10-27", weeks: 2 }), NOW);
    expect(plan).toEqual({
      ok: true,
      slots: [
        { starts_at: "2026-10-27T15:00:00.000Z", ends_at: "2026-10-27T17:00:00.000Z", note: null },
        // 10:00 AM CST is 16:00 UTC: still 10 o'clock for the firm.
        { starts_at: "2026-11-03T16:00:00.000Z", ends_at: "2026-11-03T18:00:00.000Z", note: null },
      ],
    });
  });

  it("trims the note and stores an empty one as null", () => {
    const plan = planTimeSlots(input({ note: "  In person, Conroe  " }), NOW);
    expect(plan.ok && plan.slots[0].note).toBe("In person, Conroe");
    const blank = planTimeSlots(input({ note: "   " }), NOW);
    expect(blank.ok && blank.slots[0].note).toBeNull();
  });

  it.each([
    ["no date", { date: "" }, "Pick a valid date."],
    ["a date that doesn't exist", { date: "2026-02-30" }, "Pick a valid date."],
    ["a date in another format", { date: "10/20/2026" }, "Pick a valid date."],
    ["a malformed time", { start: "9:00" }, "Pick a start and an end time."],
    ["an hour past 23", { end: "24:00" }, "Pick a start and an end time."],
    ["an end before the start", { start: "12:00", end: "10:00" }, "The end time has to be after the start time."],
    ["an end equal to the start", { end: "10:00" }, "The end time has to be after the start time."],
    ["zero weeks", { weeks: 0 }, "Repeat for between 1 and 12 weeks."],
    ["13 weeks", { weeks: 13 }, "Repeat for between 1 and 12 weeks."],
    ["a fraction of a week", { weeks: 1.5 }, "Repeat for between 1 and 12 weeks."],
    ["a note longer than 200 characters", { note: "x".repeat(201) }, "Keep the note to 200 characters."],
  ])("refuses %s", (_label, overrides, error) => {
    expect(planTimeSlots(input(overrides as Partial<NewTimeSlotsInput>), NOW)).toEqual({ ok: false, error });
  });

  it("refuses anything that isn't the expected shape, since a server action can be called with anything", () => {
    for (const bad of [null, undefined, "2026-10-20", { date: 20261020 }, { ...input(), note: 42 }]) {
      expect(planTimeSlots(bad as unknown as NewTimeSlotsInput, NOW).ok).toBe(false);
    }
  });

  it("refuses a slot that has already started", () => {
    expect(planTimeSlots(input({ date: "2026-10-14", start: "06:30", end: "08:00" }), NOW)).toEqual({
      ok: false,
      error: "That time has already passed. Pick a later one.",
    });
    // Later the same day is fine.
    expect(planTimeSlots(input({ date: "2026-10-14", start: "08:00", end: "09:00" }), NOW).ok).toBe(true);
  });

  it("refuses a time inside the hour skipped when clocks go forward (2027-03-14)", () => {
    expect(planTimeSlots(input({ date: "2027-03-14", start: "02:00", end: "04:00" }), NOW)).toEqual({
      ok: false,
      error: "There is no 2:00 AM on Sun, Mar 14: the clocks go forward that night. Pick another time.",
    });
    // A weekly series that runs into that night is refused too.
    expect(planTimeSlots(input({ date: "2027-03-07", start: "01:00", end: "02:30", weeks: 2 }), NOW).ok).toBe(false);
    // Times either side of the jump are fine.
    expect(planTimeSlots(input({ date: "2027-03-14", start: "01:00", end: "03:00" }), NOW)).toEqual({
      ok: true,
      slots: [{ starts_at: "2027-03-14T07:00:00.000Z", ends_at: "2027-03-14T08:00:00.000Z", note: null }],
    });
  });
});

// ---------------------------------------------------------------------------
// findOverlappingSlot
// ---------------------------------------------------------------------------
describe("findOverlappingSlot", () => {
  const existing = [
    { id: "a", starts_at: "2026-10-20T15:00:00.000Z", ends_at: "2026-10-20T17:00:00.000Z" },
    { id: "b", starts_at: "2026-10-27T15:00:00.000Z", ends_at: "2026-10-27T17:00:00.000Z" },
  ];
  const planned = (starts_at: string, ends_at: string) => [{ starts_at, ends_at, note: null }];

  it("finds a slot that overlaps part of a new one", () => {
    expect(findOverlappingSlot(planned("2026-10-20T16:00:00Z", "2026-10-20T18:00:00Z"), existing)?.id).toBe("a");
  });

  it("finds a slot that sits inside a new one", () => {
    expect(findOverlappingSlot(planned("2026-10-27T14:00:00Z", "2026-10-27T19:00:00Z"), existing)?.id).toBe("b");
  });

  it("lets slots touch end to start", () => {
    expect(findOverlappingSlot(planned("2026-10-20T17:00:00Z", "2026-10-20T19:00:00Z"), existing)).toBeNull();
    expect(findOverlappingSlot(planned("2026-10-20T13:00:00Z", "2026-10-20T15:00:00Z"), existing)).toBeNull();
  });

  it("checks every slot of a weekly series", () => {
    const series = [
      { starts_at: "2026-10-13T15:00:00Z", ends_at: "2026-10-13T17:00:00Z", note: null },
      { starts_at: "2026-10-27T16:30:00Z", ends_at: "2026-10-27T18:00:00Z", note: null },
    ];
    expect(findOverlappingSlot(series, existing)?.id).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// The calendar's dates and labels
// ---------------------------------------------------------------------------
describe("calendar helpers", () => {
  it("shows whole weeks, Sunday to Saturday", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const october = monthGridDates("2026-10");
    expect(october).toHaveLength(35);
    expect(october[0]).toBe("2026-09-27");
    expect(october.at(-1)).toBe("2026-10-31");
    // February 2026 starts on a Sunday and has exactly four weeks.
    expect(monthGridDates("2026-02")).toHaveLength(28);
    // August 2026 starts on a Saturday, so it needs six rows.
    expect(monthGridDates("2026-08")).toHaveLength(42);
  });

  it("moves between months across a year end", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });

  it("only takes a real month in the ?month= link", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-1", "26-10", "1899-10", "2026-10-01", undefined, ["2026-10"]]) {
      expect(isMonthKey(bad)).toBe(false);
    }
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
  });

  it("covers a run of dates from Central midnight to Central midnight", () => {
    expect(datesToInstantRange("2026-09-27", "2026-10-31")).toEqual({
      from: "2026-09-27T05:00:00.000Z",
      to: "2026-11-01T05:00:00.000Z",
    });
  });

  it("files a late-evening slot under its Central Time date, not the UTC one", () => {
    expect(slotDateKey("2026-10-21T03:30:00Z")).toBe("2026-10-20");
  });

  it("formats times with plain spaces, so the server and browser renders match", () => {
    const slot = { starts_at: "2026-10-20T15:00:00Z", ends_at: "2026-10-20T17:30:00Z" };
    expect(formatSlotRange(slot)).toBe("10:00 AM – 12:30 PM");
    expect(describeSlot(slot)).toBe("Tue, Oct 20, 10:00 AM – 12:30 PM CT");
    expect(formatMonthKey("2026-10")).toBe("October 2026");
  });

  it("offers every half hour of the day", () => {
    expect(SLOT_TIME_OPTIONS).toHaveLength(48);
    expect(SLOT_TIME_OPTIONS[0]).toBe("00:00");
    expect(SLOT_TIME_OPTIONS.at(-1)).toBe("23:30");
    expect(formatClockTime("00:00")).toBe("12:00 AM");
    expect(formatClockTime("12:30")).toBe("12:30 PM");
    expect(formatClockTime("23:30")).toBe("11:30 PM");
  });
});

// ---------------------------------------------------------------------------
// The server actions. Anyone signed in can call a server action with any
// arguments, so these pin that both check for an admin before touching the
// table, and that the admin's checks happen before any write.
// ---------------------------------------------------------------------------
const caller: { id: string | null; role: string | null } = { id: null, role: null };
const db: {
  existing: Array<{ id: string; starts_at: string; ends_at: string }>;
  deleted: Array<{ id: string }>;
  error: { message: string; code?: string } | null;
} = { existing: [], deleted: [], error: null };
const calls: Array<{ verb: string; args: unknown[] }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: caller.id ? { id: caller.id } : null } })),
    },
    from: vi.fn((table: string) => {
      if (table === "roles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: caller.role ? { role: caller.role } : null, error: null }),
            }),
          }),
        };
      }

      // requestee_time_slots: every method is logged and returns the chain;
      // awaiting it answers for the read, insert or delete it was built from.
      let verb = "select";
      const chain: Record<string, unknown> = {};
      const log = (name: string) =>
        vi.fn((...args: unknown[]) => {
          calls.push({ verb: name, args });
          return chain;
        });
      for (const name of ["select", "lt", "gt", "eq"]) chain[name] = log(name);
      chain.insert = vi.fn((rows: unknown) => {
        verb = "insert";
        calls.push({ verb: "insert", args: [rows] });
        return chain;
      });
      chain.delete = vi.fn(() => {
        verb = "delete";
        calls.push({ verb: "delete", args: [] });
        return chain;
      });
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const data = verb === "delete" ? db.deleted : verb === "insert" ? null : db.existing;
        return Promise.resolve(db.error ? { data: null, error: db.error } : { data, error: null }).then(
          resolve,
          reject
        );
      };
      return chain;
    }),
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Actions = typeof import("@/lib/actions/requesteeTimeSlots");

describe("time slot actions", () => {
  let actions: Actions;
  const SLOT_ID = "5b0c2f7e-8d4a-4c1e-9f3b-2a6d7e8f9a0b";

  beforeAll(async () => {
    actions = await import("@/lib/actions/requesteeTimeSlots");
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
    caller.id = "admin-1";
    caller.role = "admin";
    db.existing = [];
    db.deleted = [{ id: SLOT_ID }];
    db.error = null;
    calls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run: Array<[name: string, call: (a: Actions) => Promise<unknown>]> = [
    ["createRequesteeTimeSlots", (a) => a.createRequesteeTimeSlots(input({ weeks: 3 }))],
    ["deleteRequesteeTimeSlot", (a) => a.deleteRequesteeTimeSlot(SLOT_ID)],
  ];

  for (const [name, call] of run) {
    describe(name, () => {
      it("refuses a participant, a requestee and a blacklisted login without touching the table", async () => {
        caller.id = "someone-1";
        for (const role of ["participant", "requestee", "blacklisted", null]) {
          caller.role = role;
          await expect(call(actions)).rejects.toThrow("Not authorized");
        }
        expect(calls).toEqual([]);
      });

      it("refuses a signed-out caller", async () => {
        caller.id = null;
        await expect(call(actions)).rejects.toThrow("Not authenticated");
        expect(calls).toEqual([]);
      });
    });
  }

  it("saves one row per week, recording the admin who added them", async () => {
    await expect(actions.createRequesteeTimeSlots(input({ weeks: 3, note: "Zoom" }))).resolves.toEqual({
      ok: true,
      created: 3,
    });

    const insert = calls.find((c) => c.verb === "insert");
    expect(insert?.args[0]).toEqual([
      { starts_at: "2026-10-20T15:00:00.000Z", ends_at: "2026-10-20T17:00:00.000Z", note: "Zoom", created_by: "admin-1" },
      { starts_at: "2026-10-27T15:00:00.000Z", ends_at: "2026-10-27T17:00:00.000Z", note: "Zoom", created_by: "admin-1" },
      { starts_at: "2026-11-03T16:00:00.000Z", ends_at: "2026-11-03T18:00:00.000Z", note: "Zoom", created_by: "admin-1" },
    ]);

    // The overlap check looked across the whole series.
    expect(calls).toContainEqual({ verb: "lt", args: ["starts_at", "2026-11-03T18:00:00.000Z"] });
    expect(calls).toContainEqual({ verb: "gt", args: ["ends_at", "2026-10-20T15:00:00.000Z"] });
  });

  it("names the slot in the way and saves nothing when a new slot overlaps", async () => {
    db.existing = [{ id: "x", starts_at: "2026-10-27T16:00:00Z", ends_at: "2026-10-27T19:00:00Z" }];
    await expect(actions.createRequesteeTimeSlots(input({ weeks: 3 }))).resolves.toEqual({
      ok: false,
      error:
        "This overlaps the slot on Tue, Oct 27, 11:00 AM – 2:00 PM CT. Pick another time, or delete that slot first.",
    });
    expect(calls.some((c) => c.verb === "insert")).toBe(false);
  });

  it("checks the input before reading anything", async () => {
    await expect(actions.createRequesteeTimeSlots(input({ end: "09:00" }))).resolves.toEqual({
      ok: false,
      error: "The end time has to be after the start time.",
    });
    expect(calls).toEqual([]);
  });

  it("doesn't save when the overlap check can't run", async () => {
    db.error = { message: "boom" };
    await expect(actions.createRequesteeTimeSlots(input())).resolves.toEqual({
      ok: false,
      error: "Couldn't check the calendar for overlapping slots. Try again.",
    });
    expect(calls.some((c) => c.verb === "insert")).toBe(false);
  });

  it("deletes a slot by id", async () => {
    await expect(actions.deleteRequesteeTimeSlot(SLOT_ID)).resolves.toEqual({ ok: true });
    expect(calls).toContainEqual({ verb: "eq", args: ["id", SLOT_ID] });
  });

  it("says so when nothing was deleted", async () => {
    db.deleted = [];
    await expect(actions.deleteRequesteeTimeSlot(SLOT_ID)).resolves.toEqual({
      ok: false,
      error: "Nothing was deleted. Refresh the page: the slot may already be gone.",
    });
  });

  it("refuses an id that isn't a uuid without querying", async () => {
    for (const bad of ["", "1; drop table", "not-a-uuid", 42]) {
      await expect(actions.deleteRequesteeTimeSlot(bad as string)).resolves.toEqual({
        ok: false,
        error: "That time slot doesn't exist.",
      });
    }
    expect(calls).toEqual([]);
  });
});
