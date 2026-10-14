import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";

// ---------------------------------------------------------------------------
// The admin's booking actions (lib/actions/adminSlotBooking.ts), against an
// in-memory database that enforces the bookings table's keys. Server actions
// are public endpoints, so each one is also called by a firm, a participant
// and a signed-out visitor, who must get nowhere.
// ---------------------------------------------------------------------------

const db = new FakeDb();
const caller: { id: string | null } = { id: null };
type MailSpy = (...args: unknown[]) => Promise<void>;
const mail = {
  held: vi.fn<MailSpy>(async () => undefined),
  moved: vi.fn<MailSpy>(async () => undefined),
  released: vi.fn<MailSpy>(async () => undefined),
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
        getUserById: vi.fn(async (id: string) => ({
          data: { user: id === FIRM ? { email: "firm@example.com" } : null },
        })),
      },
    },
  },
}));
vi.mock("@/lib/slotBookingEmails", () => ({
  sendSlotHeldEmail: (...args: unknown[]) => mail.held(...args),
  sendSlotMovedEmail: (...args: unknown[]) => mail.moved(...args),
  sendSlotReleasedEmail: (...args: unknown[]) => mail.released(...args),
  sendSlotTeamNotice: (...args: unknown[]) => mail.team(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ADMIN = "0a000000-0000-4000-8000-000000000001";
const FIRM = "0f000000-0000-4000-8000-000000000001";
const PARTICIPANT = "0b000000-0000-4000-8000-000000000001";
const CASE = "0c000000-0000-4000-8000-000000000001";
const OTHER_CASE = "0c000000-0000-4000-8000-000000000002";
const OFFLINE_CASE = "0c000000-0000-4000-8000-000000000003";
const REJECTED_CASE = "0c000000-0000-4000-8000-000000000004";
const SLOT_A = "05000000-0000-4000-8000-00000000000a";
const SLOT_B = "05000000-0000-4000-8000-00000000000b";
const SLOT_C = "05000000-0000-4000-8000-00000000000c";
const SLOT_PAST = "05000000-0000-4000-8000-0000000000ff";

// Tuesday 2026-10-20, 10:00 AM CDT.
const NOW = "2026-10-20T15:00:00.000Z";
// Held Monday 9:00 AM CDT: due Tuesday 9:00 AM, so overdue at NOW.
const HELD_OVERDUE = "2026-10-19T14:00:00.000Z";
// Held Tuesday 9:00 AM CDT: due Wednesday 9:00 AM, not yet due at NOW.
const HELD_RECENTLY = "2026-10-20T14:00:00.000Z";

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

function seed(booking: Record<string, unknown> | null = { held_since: HELD_RECENTLY }) {
  db.reset({
    roles: [
      { user_id: ADMIN, role: "admin", email: "admin@tjs.test" },
      { user_id: FIRM, role: "requestee", email: "firm@example.com" },
      { user_id: PARTICIPANT, role: "participant", email: "p@example.com" },
    ],
    cases: [
      caseRow(CASE),
      caseRow(OTHER_CASE, { title: "Doe v. Roe" }),
      caseRow(OFFLINE_CASE, { delivery_mode: "offline" }),
      caseRow(REJECTED_CASE, { admin_status: "rejected" }),
    ],
    confidentiality_agreements_requestee: [{ user_id: FIRM, first_name: "Jane", last_name: "Roe" }],
    requestee_time_slots: [
      { id: SLOT_A, starts_at: "2026-10-27T15:00:00.000Z", ends_at: "2026-10-27T17:00:00.000Z", note: null },
      { id: SLOT_B, starts_at: "2026-10-28T15:00:00.000Z", ends_at: "2026-10-28T17:00:00.000Z", note: null },
      { id: SLOT_C, starts_at: "2026-10-29T15:00:00.000Z", ends_at: "2026-10-29T17:00:00.000Z", note: null },
      { id: SLOT_PAST, starts_at: "2026-10-19T15:00:00.000Z", ends_at: "2026-10-19T17:00:00.000Z", note: null },
    ],
    requestee_slot_bookings: [
      ...(booking
        ? [{ case_id: CASE, slot_id: SLOT_A, booked_by: FIRM, held_since: null, paid_at: null, paid_by: null, ...booking }]
        : []),
      // Another firm's case already holds slot C.
      { case_id: OTHER_CASE, slot_id: SLOT_C, booked_by: FIRM, held_since: HELD_RECENTLY, paid_at: null, paid_by: null },
    ],
  });
}

const bookingOf = (caseId: string) => db.rows("requestee_slot_bookings").find((b) => b.case_id === caseId);

type Actions = typeof import("@/lib/actions/adminSlotBooking");
let actions: Actions;

beforeAll(async () => {
  actions = await import("@/lib/actions/adminSlotBooking");
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(console, "error").mockImplementation(() => {});
  caller.id = ADMIN;
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

describe("only an admin can use them", () => {
  const calls: Array<[string, (a: Actions) => Promise<unknown>]> = [
    ["markBookingPaid", (a) => a.markBookingPaid(CASE)],
    ["markBookingUnpaid", (a) => a.markBookingUnpaid(CASE)],
    ["cancelBooking", (a) => a.cancelBooking(CASE, SLOT_A, "other")],
    ["moveBooking", (a) => a.moveBooking(CASE, SLOT_A, SLOT_B)],
    ["assignSlot", (a) => a.assignSlot(REJECTED_CASE, SLOT_B)],
  ];

  for (const [name, call] of calls) {
    it(`${name} refuses a firm, a participant and a signed-out caller, writing nothing`, async () => {
      for (const who of [FIRM, PARTICIPANT]) {
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

describe("payment", () => {
  it("marks a booking paid, once", async () => {
    await expect(actions.markBookingPaid(CASE)).resolves.toEqual({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ paid_at: NOW, paid_by: ADMIN });
    await expect(actions.markBookingPaid(CASE)).resolves.toMatchObject({ ok: false });
  });

  it("marks it unpaid again", async () => {
    seed({ held_since: HELD_RECENTLY, paid_at: NOW, paid_by: ADMIN });
    await expect(actions.markBookingUnpaid(CASE)).resolves.toEqual({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ paid_at: null, paid_by: null });
  });
});

describe("releasing a hold", () => {
  it("won't release for non-payment before the deadline", async () => {
    const result = await actions.cancelBooking(CASE, SLOT_A, "unpaid");
    expect(result).toEqual({ ok: false, error: "Payment isn't due until Wed, Oct 21, 9:00 AM CT." });
    expect(db.writes).toEqual([]);
  });

  it("won't release a paid booking for non-payment", async () => {
    seed({ held_since: HELD_OVERDUE, paid_at: NOW });
    expect(await actions.cancelBooking(CASE, SLOT_A, "unpaid")).toMatchObject({ ok: false });
    expect(db.writes).toEqual([]);
  });

  it("releases an overdue hold, stops the clock, and tells the firm it can pick again", async () => {
    seed({ held_since: HELD_OVERDUE });
    await expect(actions.cancelBooking(CASE, SLOT_A, "unpaid")).resolves.toEqual({ ok: true, warning: undefined });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: null, held_since: null });
    expect(mail.released).toHaveBeenCalledWith(
      expect.objectContaining({ to: "firm@example.com", reason: "unpaid", canRebook: true })
    );
    expect(mail.team).toHaveBeenCalledTimes(1);
  });

  it("releases for another reason and keeps the clock running", async () => {
    await expect(actions.cancelBooking(CASE, SLOT_A, "other")).resolves.toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: null, held_since: HELD_RECENTLY });
  });

  it("changes nothing if the booking moved since the page loaded", async () => {
    const result = await actions.cancelBooking(CASE, SLOT_B, "other");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Refresh") });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_A });
  });

  it("still succeeds, with a warning, when the firm's email fails", async () => {
    mail.released.mockRejectedValueOnce(new Error("mailer down"));
    const result = await actions.cancelBooking(CASE, SLOT_A, "other");
    expect(result).toMatchObject({ ok: true, warning: expect.stringContaining("firm@example.com") });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: null });
  });
});

describe("moving a booking", () => {
  it("moves it to a free slot, keeping the clock and any payment", async () => {
    seed({ held_since: HELD_RECENTLY, paid_at: NOW, paid_by: ADMIN });
    await expect(actions.moveBooking(CASE, SLOT_A, SLOT_B)).resolves.toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_B, held_since: HELD_RECENTLY, paid_at: NOW });
    expect(mail.moved).toHaveBeenCalledWith(expect.objectContaining({ to: "firm@example.com" }));
  });

  it("won't move it into a slot whose hours other cases have taken", async () => {
    // Slot C is 2 hours, all of them the other case's.
    expect(await actions.moveBooking(CASE, SLOT_A, SLOT_C)).toEqual({ ok: false, error: "That time doesn't have enough hours left for this case. Pick a different one." });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_A });
  });

  it("moves it into a slot another case shares, while its hours fit", async () => {
    for (const c of db.rows("cases")) if (c.id === CASE || c.id === OTHER_CASE) c.hours_requested = 1;
    expect(await actions.moveBooking(CASE, SLOT_A, SLOT_C)).toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_C });
    expect(bookingOf(OTHER_CASE)).toMatchObject({ slot_id: SLOT_C });
  });

  it("won't move it into the past", async () => {
    expect(await actions.moveBooking(CASE, SLOT_A, SLOT_PAST)).toMatchObject({ ok: false });
    expect(db.writes).toEqual([]);
  });
});

describe("booking a slot for a firm", () => {
  it("refuses in-person and rejected cases", async () => {
    expect(await actions.assignSlot(OFFLINE_CASE, SLOT_B)).toEqual({
      ok: false,
      error: "Time slots are for online focus groups only.",
    });
    expect(await actions.assignSlot(REJECTED_CASE, SLOT_B)).toMatchObject({ ok: false });
    expect(db.writes).toEqual([]);
  });

  it("refuses a case that already holds a slot", async () => {
    expect(await actions.assignSlot(CASE, SLOT_B)).toEqual({
      ok: false,
      error: "This case already holds a time. Move it instead.",
    });
  });

  it("books a case with no record and starts its clock now", async () => {
    seed(null);
    await expect(actions.assignSlot(CASE, SLOT_B)).resolves.toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_B, held_since: NOW, booked_by: ADMIN });
    expect(mail.held).toHaveBeenCalledWith(expect.objectContaining({ to: "firm@example.com", paid: false }));
  });

  it("re-books a released case on its running clock, and doesn't ask a paid firm to pay", async () => {
    seed({ slot_id: null, held_since: HELD_OVERDUE, paid_at: NOW });
    await expect(actions.assignSlot(CASE, SLOT_B)).resolves.toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_B, held_since: HELD_OVERDUE });
    expect(mail.held).toHaveBeenCalledWith(expect.objectContaining({ paid: true }));
  });

  it("refuses a slot whose hours other cases have taken", async () => {
    seed(null);
    expect(await actions.assignSlot(CASE, SLOT_C)).toEqual({ ok: false, error: "That time doesn't have enough hours left for this case. Pick a different one." });
    expect(bookingOf(CASE)).toBeUndefined();
  });

  it("books a slot another case shares, while its hours fit", async () => {
    seed(null);
    for (const c of db.rows("cases")) if (c.id === CASE || c.id === OTHER_CASE) c.hours_requested = 1;
    expect(await actions.assignSlot(CASE, SLOT_C)).toMatchObject({ ok: true });
    expect(bookingOf(CASE)).toMatchObject({ slot_id: SLOT_C });
  });
});
