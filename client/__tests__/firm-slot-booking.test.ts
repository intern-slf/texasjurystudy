import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";

// ---------------------------------------------------------------------------
// A law firm's own booking actions (lib/actions/requesteeSlotBooking.ts), against
// an in-memory database that enforces the bookings table's keys. These are server
// actions, so anyone signed in can call them with any case and slot ids: the
// tests check the role, the case's owner and state, and the slot's rules come
// first, and that a firm never sees another firm's booking.
// ---------------------------------------------------------------------------

const db = new FakeDb();
const caller: { id: string | null } = { id: null };
type MailSpy = (...args: unknown[]) => Promise<void>;
const mail = {
  held: vi.fn<MailSpy>(async () => undefined),
  team: vi.fn<MailSpy>(async () => undefined),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: caller.id ? { id: caller.id } : null } })) },
    from: (table: string) => db.from(table),
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => db.from(table),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({ data: { user: { email: `${id.slice(0, 4)}@firm.test` } } })),
      },
    },
  },
}));
vi.mock("@/lib/slotBookingEmails", () => ({
  sendSlotHeldEmail: (...args: unknown[]) => mail.held(...args),
  sendSlotTeamNotice: (...args: unknown[]) => mail.team(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const FIRM = "0f000000-0000-4000-8000-000000000001";
const OTHER_FIRM = "0f000000-0000-4000-8000-000000000002";
const ADMIN = "0a000000-0000-4000-8000-000000000001";
const PARTICIPANT = "0b000000-0000-4000-8000-000000000001";

const CASE = "0c000000-0000-4000-8000-000000000001";
const APPROVED_CASE = "0c000000-0000-4000-8000-000000000002";
const REJECTED_CASE = "0c000000-0000-4000-8000-000000000003";
const ARCHIVED_CASE = "0c000000-0000-4000-8000-000000000004";
const OFFLINE_CASE = "0c000000-0000-4000-8000-000000000005";
const OTHER_FIRMS_CASE = "0c000000-0000-4000-8000-000000000006";
const OTHER_FIRMS_SHORT_CASE = "0c000000-0000-4000-8000-000000000007";

const SLOT_OK = "05000000-0000-4000-8000-000000000001";
const SLOT_OK_2 = "05000000-0000-4000-8000-000000000002";
const SLOT_TOO_SOON = "05000000-0000-4000-8000-000000000003";
const SLOT_TOO_SHORT = "05000000-0000-4000-8000-000000000004";
const SLOT_TAKEN = "05000000-0000-4000-8000-000000000005";
// 3 hours, 1 of them another firm's.
const SLOT_SHARED = "05000000-0000-4000-8000-000000000006";
const MISSING_SLOT = "05000000-0000-4000-8000-0000000000ff";

// Tuesday 2026-10-20, 10:00 AM CDT. The earliest bookable start is 48 working
// hours later: Thursday 10:00 AM CDT.
const NOW = "2026-10-20T15:00:00.000Z";

const caseRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: "Smith v. Jones",
  user_id: FIRM,
  requestee_id: null,
  admin_status: "all",
  status: "current",
  deleted_at: null,
  delivery_mode: "online",
  hours_requested: 2,
  ...extra,
});

const slotRow = (id: string, startsAt: string, endsAt: string) => ({ id, starts_at: startsAt, ends_at: endsAt, note: null });

function seed(bookingForCase: Record<string, unknown> | null = null) {
  db.reset({
    roles: [
      { user_id: FIRM, role: "requestee" },
      { user_id: OTHER_FIRM, role: "requestee" },
      { user_id: ADMIN, role: "admin" },
      { user_id: PARTICIPANT, role: "participant" },
    ],
    cases: [
      caseRow(CASE),
      caseRow(APPROVED_CASE, { admin_status: "approved" }),
      caseRow(REJECTED_CASE, { admin_status: "rejected" }),
      caseRow(ARCHIVED_CASE, { status: "previous", deleted_at: "2026-10-19T12:00:00.000Z" }),
      caseRow(OFFLINE_CASE, { delivery_mode: "offline" }),
      caseRow(OTHER_FIRMS_CASE, { user_id: OTHER_FIRM, title: "Doe v. Roe" }),
      caseRow(OTHER_FIRMS_SHORT_CASE, { user_id: OTHER_FIRM, title: "Roe v. Wade", hours_requested: 1 }),
    ],
    confidentiality_agreements_requestee: [{ user_id: FIRM, first_name: "Jane", last_name: "Roe" }],
    requestee_time_slots: [
      slotRow(SLOT_OK, "2026-10-26T15:00:00.000Z", "2026-10-26T17:00:00.000Z"),
      slotRow(SLOT_OK_2, "2026-10-27T15:00:00.000Z", "2026-10-27T17:00:00.000Z"),
      slotRow(SLOT_TOO_SOON, "2026-10-21T15:00:00.000Z", "2026-10-21T17:00:00.000Z"),
      slotRow(SLOT_TOO_SHORT, "2026-10-26T18:00:00.000Z", "2026-10-26T18:30:00.000Z"),
      slotRow(SLOT_TAKEN, "2026-10-28T15:00:00.000Z", "2026-10-28T17:00:00.000Z"),
      slotRow(SLOT_SHARED, "2026-10-29T14:00:00.000Z", "2026-10-29T17:00:00.000Z"),
    ],
    requestee_slot_bookings: [
      // The other firm holds SLOT_TAKEN.
      { case_id: OTHER_FIRMS_CASE, slot_id: SLOT_TAKEN, booked_by: OTHER_FIRM, held_since: NOW, paid_at: null, paid_by: null },
      // And 1 hour of SLOT_SHARED.
      { case_id: OTHER_FIRMS_SHORT_CASE, slot_id: SLOT_SHARED, booked_by: OTHER_FIRM, held_since: NOW, paid_at: null, paid_by: null },
      ...(bookingForCase
        ? [{ case_id: CASE, slot_id: null, booked_by: FIRM, held_since: null, paid_at: null, paid_by: null, ...bookingForCase }]
        : []),
    ],
  });
}

const bookingOf = (caseId: string) => db.rows("requestee_slot_bookings").find((b) => b.case_id === caseId);

type Actions = typeof import("@/lib/actions/requesteeSlotBooking");
let actions: Actions;

beforeAll(async () => {
  actions = await import("@/lib/actions/requesteeSlotBooking");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "error").mockImplementation(() => {});
  caller.id = FIRM;
  seed();
  for (const spy of Object.values(mail)) {
    spy.mockReset();
    spy.mockImplementation(async () => undefined);
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("only a firm can use them", () => {
  const calls: Array<[string, (a: Actions) => Promise<unknown>]> = [
    ["listOpenTimeSlots", (a) => a.listOpenTimeSlots()],
    ["chooseTimeSlot", (a) => a.chooseTimeSlot(CASE, SLOT_OK)],
    ["cancelMyTimeSlot", (a) => a.cancelMyTimeSlot(CASE)],
  ];

  for (const [name, call] of calls) {
    it(`${name} refuses participants, admins and signed-out callers, writing nothing`, async () => {
      // The role comes from public.roles; what a login says about itself in
      // user_metadata never counts.
      for (const who of [PARTICIPANT, ADMIN]) {
        caller.id = who;
        await expect(call(actions)).rejects.toThrow("Not authorized");
      }
      caller.id = null;
      await expect(call(actions)).rejects.toThrow("Not authenticated");
      expect(db.writes).toEqual([]);
      expect(mail.team).not.toHaveBeenCalled();
    });
  }
});

describe("the open times a firm sees", () => {
  it("lists slots with an hour or more free, far enough ahead, saying how much is left and nothing about who", async () => {
    const result = await actions.listOpenTimeSlots();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Too soon, full, and under an hour (the 30-minute one) are left out; one
    // another firm has part-booked stays, with its 2 hours left.
    expect(result.slots.map((s) => [s.id, s.minutes_left])).toEqual([
      [SLOT_OK, 120],
      [SLOT_OK_2, 120],
      [SLOT_SHARED, 120],
    ]);
    for (const slot of result.slots) {
      expect(Object.keys(slot).sort()).toEqual(["ends_at", "id", "minutes_left", "note", "starts_at"]);
    }
  });
});

describe("the open times on a firm's own case page", () => {
  it("don't count the case's own hours as someone else's", async () => {
    // The other firm's 1-hour case sits in SLOT_SHARED; on its own page that
    // hour is its own, so the slot is shown with all 3 hours.
    const { getOpenSlots } = await import("@/lib/slotBookingData");
    const from = "2026-10-22T15:00:00.000Z";
    const to = "2026-12-31T00:00:00.000Z";
    const seen = await getOpenSlots(from, to, OTHER_FIRMS_SHORT_CASE);
    expect(seen.find((s) => s.id === SLOT_SHARED)?.minutes_left).toBe(180);
    const others = await getOpenSlots(from, to);
    expect(others.find((s) => s.id === SLOT_SHARED)?.minutes_left).toBe(120);
  });
});

describe("booking a time", () => {
  it("holds a free slot and starts the payment clock", async () => {
    const result = await actions.chooseTimeSlot(CASE, SLOT_OK);
    expect(result).toMatchObject({ ok: true, paid: false, slot: { id: SLOT_OK } });
    // Due Wednesday 10:00 AM CDT, one working day later.
    expect(result.ok && result.dueAt).toBe("2026-10-21T15:00:00.000Z");
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_OK, held_since: NOW, booked_by: FIRM });
    expect(mail.held).toHaveBeenCalledWith(expect.objectContaining({ caseId: CASE, paid: false }));
    expect(mail.team).toHaveBeenCalledWith(expect.objectContaining({ heading: "A firm booked a time" }));
  });

  it("treats another firm's case like one that doesn't exist", async () => {
    expect(await actions.chooseTimeSlot(OTHER_FIRMS_CASE, SLOT_OK)).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(await actions.chooseTimeSlot("0c000000-0000-4000-8000-0000000000ff", SLOT_OK)).toEqual({
      ok: false,
      error: "That case doesn't exist.",
    });
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["an approved case", APPROVED_CASE, "Your case has been approved, so to change its time"],
    ["a rejected case", REJECTED_CASE, "This case can't hold a time right now"],
    ["an archived case", ARCHIVED_CASE, "This case can't hold a time right now"],
    ["an in-person case", OFFLINE_CASE, "Time slots are for online focus groups"],
  ])("refuses %s", async (_label, caseId, message) => {
    const result = await actions.chooseTimeSlot(caseId, SLOT_OK);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining(message) });
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["too soon", SLOT_TOO_SOON, "too soon"],
    ["too short for the hours requested", SLOT_TOO_SHORT, "shorter than the 2 hours"],
    ["gone", MISSING_SLOT, "no longer available"],
  ])("refuses a slot that is %s", async (_label, slotId, message) => {
    expect(await actions.chooseTimeSlot(CASE, slotId)).toMatchObject({ ok: false, error: expect.stringContaining(message) });
    expect(db.writes).toEqual([]);
  });

  it("shares a slot another firm has part-booked, while its hours fit", async () => {
    const result = await actions.chooseTimeSlot(CASE, SLOT_SHARED);
    expect(result).toMatchObject({ ok: true, slot: { id: SLOT_SHARED } });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_SHARED });
    expect(bookingOf(OTHER_FIRMS_SHORT_CASE)).toMatchObject({ slot_id: SLOT_SHARED });
    expect(mail.held).toHaveBeenCalledWith(expect.objectContaining({ hoursRequested: 2 }));
  });

  it("refuses a slot without enough hours left, saying how much is", async () => {
    expect(await actions.chooseTimeSlot(CASE, SLOT_TAKEN)).toEqual({
      ok: false,
      error: "That time is fully booked. Pick another one.",
    });
    for (const c of db.rows("cases")) if (c.id === CASE) c.hours_requested = 3;
    expect(await actions.chooseTimeSlot(CASE, SLOT_SHARED)).toEqual({
      ok: false,
      error: "That time has only 2 hours left, and your case needs 3 hours. Pick another one.",
    });
    expect(bookingOf(CASE)).toBeUndefined();
    expect(mail.held).not.toHaveBeenCalled();
  });

  it("loses the race when another firm takes the last hours first, and says so", async () => {
    // The database counts again as it writes: here the other booking lands
    // between this action's check and its write.
    vi.spyOn(db, "violation").mockReturnValueOnce({ code: "23514", message: "requestee_slot_full: 0 minutes left" });
    expect(await actions.chooseTimeSlot(CASE, SLOT_SHARED)).toEqual({
      ok: false,
      error: "Someone has just booked hours in that time, so it no longer has room for your case. Pick another one.",
    });
    expect(bookingOf(CASE)).toBeUndefined();
    expect(mail.held).not.toHaveBeenCalled();
  });

  it("does nothing when the case already holds that slot", async () => {
    seed({ slot_id: SLOT_OK, held_since: NOW });
    await expect(actions.chooseTimeSlot(CASE, SLOT_OK)).resolves.toMatchObject({ ok: true });
    expect(db.writes).toEqual([]);
  });

  it("switches slots on the same clock, keeping any payment", async () => {
    const earlier = "2026-10-19T14:00:00.000Z";
    seed({ slot_id: SLOT_OK, held_since: earlier, paid_at: NOW });
    const result = await actions.chooseTimeSlot(CASE, SLOT_OK_2);
    expect(result).toMatchObject({ ok: true, paid: true, dueAt: null });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_OK_2, held_since: earlier, paid_at: NOW });
    expect(mail.team).toHaveBeenCalledWith(expect.objectContaining({ heading: "A firm changed its booked time" }));
  });

  it("re-books after a cancel on the clock it already had", async () => {
    const earlier = "2026-10-19T14:00:00.000Z"; // Monday 9:00 AM CDT, due Tuesday 9:00 AM
    seed({ slot_id: null, held_since: earlier });
    const result = await actions.chooseTimeSlot(CASE, SLOT_OK_2);
    expect(result).toMatchObject({ ok: true, dueAt: "2026-10-20T14:00:00.000Z" });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_OK_2, held_since: earlier });
  });
});

describe("cancelling a time", () => {
  it("frees the slot and keeps the clock running", async () => {
    seed({ slot_id: SLOT_OK, held_since: NOW });
    await expect(actions.cancelMyTimeSlot(CASE)).resolves.toEqual({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: null, held_since: NOW });
    expect(mail.team).toHaveBeenCalledWith(expect.objectContaining({ heading: "A firm cancelled its booked time" }));
  });

  it("won't cancel a paid time", async () => {
    seed({ slot_id: SLOT_OK, held_since: NOW, paid_at: NOW });
    expect(await actions.cancelMyTimeSlot(CASE)).toMatchObject({ ok: false, error: expect.stringContaining("paid for") });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_OK });
  });

  it("won't cancel once the case is approved", async () => {
    expect(await actions.cancelMyTimeSlot(APPROVED_CASE)).toMatchObject({
      ok: false,
      error: expect.stringContaining("approved"),
    });
  });

  it("has nothing to do when no time is held", async () => {
    await expect(actions.cancelMyTimeSlot(CASE)).resolves.toEqual({ ok: true });
    expect(db.writes).toEqual([]);
  });
});
