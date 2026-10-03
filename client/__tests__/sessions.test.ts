import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";
import { localToUTCTime } from "@/lib/timezone";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";
process.env.NEXT_PUBLIC_APP_URL ||= "http://test.local";
process.env.EMAIL_ACTION_SECRET ||= "test-secret-for-sessions";

// ---------------------------------------------------------------------------
// Unified stateful mock for both supabase clients
//
// updateInviteStatus uses `supabaseAdmin`; createSession/addCasesToSession/
// inviteParticipants use `supabase` (server client). Both return the same
// chainable builder backed by the same response queue + capture log, so a
// test can drive the whole flow regardless of which client the action chose.
// ---------------------------------------------------------------------------
type CapturedOp =
  | { op: "select"; cols?: unknown; options?: unknown }
  | { op: "update"; payload: Record<string, unknown> }
  | { op: "upsert"; payload: Record<string, unknown> }
  | { op: "insert"; payload: unknown }
  | { op: "delete" };

type CapturedCall = {
  table: string;
  ops: CapturedOp[];
  eqs: Array<[string, unknown]>;
  ins: Array<[string, readonly unknown[]]>;
};

const state: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  responses: Array<Record<string, unknown>>;
  captured: CapturedCall[];
  rlsBlock: boolean;
  // participantId → email (for supabaseAdmin.auth.admin.getUserById)
  participantEmails: Map<string, string>;
  // Participants with no auth.users row, as jury_participants_without_login()
  // would report them. Answered outside the response queue so a test only has to
  // opt in when the no-login guard is what it is testing.
  noLoginIds: string[];
} = {
  user: null,
  responses: [],
  captured: [],
  rlsBlock: false,
  participantEmails: new Map(),
  noLoginIds: [],
};

function nextResponse(): Record<string, unknown> {
  if (state.rlsBlock) {
    return {
      data: null,
      error: { message: "row-level security violation", code: "42501" },
    };
  }
  return state.responses.shift() ?? { data: null, error: null };
}

function makeChainBuilder(table: string) {
  const captured: CapturedCall = { table, ops: [], eqs: [], ins: [] };
  state.captured.push(captured);

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((cols?: unknown, options?: unknown) => {
    captured.ops.push({ op: "select", cols, options });
    return builder;
  });
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    captured.ops.push({ op: "update", payload });
    return builder;
  });
  builder.insert = vi.fn((payload: unknown) => {
    captured.ops.push({ op: "insert", payload });
    return builder;
  });
  builder.upsert = vi.fn((payload: Record<string, unknown>) => {
    captured.ops.push({ op: "upsert", payload });
    return builder;
  });
  builder.delete = vi.fn(() => {
    captured.ops.push({ op: "delete" });
    return builder;
  });
  builder.eq = vi.fn((col: string, val: unknown) => {
    captured.eqs.push([col, val]);
    return builder;
  });
  builder.in = vi.fn((col: string, vals: readonly unknown[]) => {
    captured.ins.push([col, vals]);
    return builder;
  });
  builder.order = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => nextResponse());
  builder.single = vi.fn(async () => nextResponse());
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown
  ) => Promise.resolve(nextResponse()).then(resolve);

  return builder;
}

function makeClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
      admin: {
        getUserById: vi.fn(async (id: string) => {
          const email = state.participantEmails.get(id);
          return {
            data: email ? { user: { id, email } } : { user: null },
            error: null,
          };
        }),
      },
    },
    from: vi.fn((table: string) => makeChainBuilder(table)),
    rpc: vi.fn(async (fn: string) =>
      fn === "jury_participants_without_login"
        ? { data: [...state.noLoginIds], error: null }
        : { data: null, error: { message: `unknown function ${fn}` } }
    ),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeClient()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: makeClient(),
}));

// ---------------------------------------------------------------------------
// Mail mocks — session.ts and updateInviteStatus.ts pull a lot of names
// from @/lib/mail; the factory must export every one referenced at import.
// ---------------------------------------------------------------------------
type SendEmailArgs = { to: string; subject: string; html: string };
const sendEmailSpy = vi.fn<(args: SendEmailArgs) => Promise<void>>(
  async () => undefined
);
const sendInviteAcceptedConfirmationEmailSpy = vi.fn(async () => undefined);
const sendInviteDeclinedConfirmationEmailSpy = vi.fn(async () => undefined);
const sendSessionFullEmailSpy = vi.fn(async () => undefined);
const sendZoomLinkEmailSpy = vi.fn(async () => undefined);
const sendSessionLocationEmailSpy = vi.fn(async () => undefined);
const sendWaitlistConfirmationEmailSpy = vi.fn(async () => undefined);
const sendWaitlistZoomLinkEmailSpy = vi.fn(async () => undefined);
const sendWaitlistCalledInEmailSpy = vi.fn(async () => undefined);
const sendWaitlistWaitedOutEmailSpy = vi.fn(async () => undefined);

vi.mock("@/lib/mail", () => ({
  sendEmail: (args: SendEmailArgs) => sendEmailSpy(args),
  sendRescheduleEmail: vi.fn(async () => undefined),
  sendSessionCreatedEmail: vi.fn(async () => undefined),
  sendSessionCompletedEmail: vi.fn(async () => undefined),
  sendPresenceConfirmedEmail: vi.fn(async () => undefined),
  sendPresenceDeclinedEmail: vi.fn(async () => undefined),
  sendZoomLinkEmail: (...args: unknown[]) =>
    sendZoomLinkEmailSpy(...(args as [])),
  sendSessionLocationEmail: (...args: unknown[]) =>
    sendSessionLocationEmailSpy(...(args as [])),
  sendPresenterInfoEmail: vi.fn(async () => undefined),
  sendInviteAcceptedConfirmationEmail: (...args: unknown[]) =>
    sendInviteAcceptedConfirmationEmailSpy(...(args as [])),
  sendInviteDeclinedConfirmationEmail: (...args: unknown[]) =>
    sendInviteDeclinedConfirmationEmailSpy(...(args as [])),
  sendSessionFullEmail: (...args: unknown[]) =>
    sendSessionFullEmailSpy(...(args as [])),
  sendWaitlistConfirmationEmail: (...args: unknown[]) =>
    sendWaitlistConfirmationEmailSpy(...(args as [])),
  sendWaitlistZoomLinkEmail: (...args: unknown[]) =>
    sendWaitlistZoomLinkEmailSpy(...(args as [])),
  sendWaitlistCalledInEmail: (...args: unknown[]) =>
    sendWaitlistCalledInEmailSpy(...(args as [])),
  sendWaitlistWaitedOutEmail: (...args: unknown[]) =>
    sendWaitlistWaitedOutEmailSpy(...(args as [])),
  sendApprovalEmail: vi.fn(async () => undefined),
  sendRejectionEmail: vi.fn(async () => undefined),
  emailWrapper: (content: string) => `<wrapped>${content}</wrapped>`,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Sessions", () => {
  beforeEach(() => {
    state.user = null;
    state.responses = [];
    state.captured = [];
    state.rlsBlock = false;
    state.participantEmails = new Map();
    state.noLoginIds = [];
    sendEmailSpy.mockClear();
    sendInviteAcceptedConfirmationEmailSpy.mockClear();
    sendInviteDeclinedConfirmationEmailSpy.mockClear();
    sendSessionFullEmailSpy.mockClear();
    sendZoomLinkEmailSpy.mockClear();
    sendSessionLocationEmailSpy.mockClear();
    sendWaitlistConfirmationEmailSpy.mockClear();
    sendWaitlistZoomLinkEmailSpy.mockClear();
    sendWaitlistCalledInEmailSpy.mockClear();
    sendWaitlistWaitedOutEmailSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // create-session.test.ts — real createSession
  // -------------------------------------------------------------------------
  describe("create-session.test.ts", () => {
    let createSession: (typeof import("@/lib/actions/session"))["createSession"];
    beforeAll(async () => {
      ({ createSession } = await import("@/lib/actions/session"));
    });

    it("Inserts row with admin as created_by", async () => {
      state.user = {
        id: "admin-1",
        user_metadata: { role: "admin" },
      };
      state.responses = [
        { data: { id: "session-42" }, error: null },
      ];

      const sessionId = await createSession("2026-07-04");

      expect(sessionId).toBe("session-42");
      const c = state.captured.find((x) => x.table === "sessions")!;
      const insert = c.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Record<string, unknown>;
      };
      expect(insert.payload.created_by).toBe("admin-1");
      expect(insert.payload.session_date).toBe("2026-07-04");
    });

    it("Non-admin blocked", async () => {
      // Non-admins are blocked at the RLS boundary — insert returns 42501.
      state.user = {
        id: "user-not-admin",
        user_metadata: { role: "requestee" },
      };
      state.rlsBlock = true;

      await expect(createSession("2026-07-04")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  // -------------------------------------------------------------------------
  // add-cases-to-session.test.ts — real addCasesToSession
  // -------------------------------------------------------------------------
  describe("add-cases-to-session.test.ts", () => {
    let addCasesToSession: (typeof import("@/lib/actions/session"))["addCasesToSession"];
    beforeAll(async () => {
      ({ addCasesToSession } = await import("@/lib/actions/session"));
    });

    const cases = [
      { caseId: "case-A", start: "09:00", end: "10:00" },
      { caseId: "case-B", start: "10:30", end: "11:30" },
      { caseId: "case-C", start: "13:00", end: "14:00" },
    ];

    /**
     * The delivery-mode guard runs before the insert — a session may not mix
     * in-person and online cases. Two reads: the incoming cases' modes, then
     * whatever is already attached to the session. Everything online unless a
     * test says otherwise, which is what every pre-existing case is.
     */
    const modeGuard = (
      opts: { incoming?: string[]; attached?: string[] } = {}
    ) => [
      {
        data: (opts.incoming ?? ["online", "online", "online"]).map((m, i) => ({
          id: `case-${String.fromCharCode(65 + i)}`,
          delivery_mode: m,
        })),
        error: null,
      },
      {
        data: (opts.attached ?? []).map((m, i) => ({
          case_id: `attached-${i}`,
          cases: { delivery_mode: m },
        })),
        error: null,
      },
    ];

    it("Creates one row per case", async () => {
      state.responses = [
        ...modeGuard(),
        { error: null }, // session_cases insert
        // select cases.in
        {
          data: [
            { id: "case-A", scheduled_at: null },
            { id: "case-B", scheduled_at: null },
            { id: "case-C", scheduled_at: null },
          ],
          error: null,
        },
        { error: null }, // case update 1
        { error: null }, // case update 2
        { error: null }, // case update 3
      ];

      await addCasesToSession("session-1", cases, "2026-06-15", "UTC");

      // `find` by table alone would now land on the delivery-mode guard's
      // read of session_cases, which has no insert op.
      const sc = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      )!;
      const insert = sc.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: unknown;
      };
      expect(Array.isArray(insert.payload)).toBe(true);
      expect((insert.payload as unknown[]).length).toBe(3);
    });

    it("Correct UTC time conversion", async () => {
      // For tz=UTC the conversion is identity — assertions stay deterministic.
      state.responses = [
        ...modeGuard(),
        { error: null },
        {
          data: [
            { id: "case-A", scheduled_at: null },
            { id: "case-B", scheduled_at: null },
            { id: "case-C", scheduled_at: null },
          ],
          error: null,
        },
        { error: null },
        { error: null },
        { error: null },
      ];

      await addCasesToSession("session-1", cases, "2026-06-15", "UTC");

      const sc = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      )!;
      const insert = sc.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<{ start_time: string; end_time: string }>;
      };
      expect(insert.payload[0].start_time).toBe(
        localToUTCTime("2026-06-15", "09:00", "UTC")
      );
      expect(insert.payload[0].end_time).toBe(
        localToUTCTime("2026-06-15", "10:00", "UTC")
      );
      expect(insert.payload[2].start_time).toBe(
        localToUTCTime("2026-06-15", "13:00", "UTC")
      );
    });

    it("Updates each case's admin_scheduled_at", async () => {
      state.responses = [
        ...modeGuard(),
        { error: null },
        {
          data: [
            { id: "case-A", scheduled_at: null },
            { id: "case-B", scheduled_at: null },
            { id: "case-C", scheduled_at: null },
          ],
          error: null,
        },
        { error: null },
        { error: null },
        { error: null },
      ];

      await addCasesToSession("session-1", cases, "2026-06-15", "UTC");

      const caseUpdates = state.captured.filter(
        (c) => c.table === "cases" && c.ops.some((o) => o.op === "update")
      );
      expect(caseUpdates.length).toBe(3);
      for (const cu of caseUpdates) {
        const upd = cu.ops.find((o) => o.op === "update") as {
          op: "update";
          payload: Record<string, unknown>;
        };
        expect(upd.payload.admin_scheduled_at).toEqual(expect.any(String));
        expect(upd.payload.admin_scheduled_at).toMatch(
          /^2026-06-15T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
      }
      // Each case was targeted by id
      const ids = caseUpdates.flatMap((c) =>
        c.eqs.filter(([col]) => col === "id").map(([, v]) => v)
      );
      expect(ids).toEqual(
        expect.arrayContaining(["case-A", "case-B", "case-C"])
      );
    });

    /* ---------------------------------------------------------------------
       DELIVERY MODE — a session holds in-person cases or online cases, never
       both. Rejected here as well as by a database trigger, and rejected
       BEFORE the insert so a refused attach leaves nothing behind.
    --------------------------------------------------------------------- */

    it("Attaching all-offline cases is fine", async () => {
      state.responses = [
        ...modeGuard({ incoming: ["offline", "offline", "offline"] }),
        { error: null },
        { data: [], error: null },
      ];

      await addCasesToSession("session-1", cases, "2026-06-15", "UTC");

      const sc = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      );
      expect(sc).toBeDefined();
    });

    it("Refuses a selection that mixes in-person and online cases", async () => {
      state.responses = [
        ...modeGuard({ incoming: ["offline", "online", "online"] }),
      ];

      await expect(
        addCasesToSession("session-1", cases, "2026-06-15", "UTC")
      ).rejects.toThrow(/cannot hold both in-person and online/i);

      // Nothing was written — the guard runs before the insert.
      const inserted = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      );
      expect(inserted).toBeUndefined();
    });

    it("Refuses an online case joining a session that already holds in-person ones", async () => {
      state.responses = [
        ...modeGuard({ incoming: ["online", "online", "online"], attached: ["offline"] }),
      ];

      await expect(
        addCasesToSession("session-1", cases, "2026-06-15", "UTC")
      ).rejects.toThrow(/cannot hold both in-person and online/i);

      const inserted = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      );
      expect(inserted).toBeUndefined();
    });

    it("An in-person case may join a session that already holds in-person ones", async () => {
      state.responses = [
        ...modeGuard({ incoming: ["offline", "offline", "offline"], attached: ["offline"] }),
        { error: null },
        { data: [], error: null },
      ];

      await addCasesToSession("session-1", cases, "2026-06-15", "UTC");

      const sc = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "insert")
      );
      expect(sc).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // replace-case-in-session.test.ts — real replaceCaseInSession
  // -------------------------------------------------------------------------
  describe("replace-case-in-session.test.ts", () => {
    let replaceCaseInSession: (typeof import("@/lib/actions/session"))["replaceCaseInSession"];
    beforeAll(async () => {
      ({ replaceCaseInSession } = await import("@/lib/actions/session"));
    });

    /** The two reads the delivery-mode guard makes: incoming case, then attached. */
    const replaceGuard = (incoming: string, attached: string[]) => [
      { data: [{ id: "case-new", delivery_mode: incoming }], error: null },
      {
        data: attached.map((m, i) => ({
          case_id: i === 0 ? "case-old" : `case-other-${i}`,
          cases: { delivery_mode: m },
        })),
        error: null,
      },
    ];

    it("Swaps in a case of the same format", async () => {
      state.responses = [
        ...replaceGuard("offline", ["offline"]),
        { error: null }, // delete old session_cases row
        { error: null }, // reset old case
        { error: null }, // insert new session_cases row
        { error: null }, // set admin_scheduled_at
        { data: { user_id: "requestee-1" }, error: null },
      ];

      await replaceCaseInSession(
        "session-1", "case-old", "case-new", "14:00:00", "15:00:00", "2026-06-15",
      );

      const deleted = state.captured.find(
        (x) => x.table === "session_cases" && x.ops.some((o) => o.op === "delete")
      );
      expect(deleted).toBeDefined();
    });

    it("Refuses a replacement of the other format", async () => {
      state.responses = [...replaceGuard("online", ["offline", "offline"])];

      await expect(
        replaceCaseInSession(
          "session-1", "case-old", "case-new", "14:00:00", "15:00:00", "2026-06-15",
        )
      ).rejects.toThrow(/cannot hold both in-person and online/i);

      // The guard runs before the delete, so the session is untouched — a
      // rejected swap must not leave it half-emptied.
      const touched = state.captured.find(
        (x) =>
          x.table === "session_cases" &&
          x.ops.some((o) => o.op === "delete" || o.op === "insert")
      );
      expect(touched).toBeUndefined();
    });

    it("Refuses to flip the format of a session by replacing its ONLY case", async () => {
      // The hole this closes: with only one case attached, excluding the
      // outgoing case from the comparison would leave nothing to compare
      // against, and an online case would slide into an in-person session whose
      // participants already accepted at the in-person rate and were sent an address.
      state.responses = [...replaceGuard("online", ["offline"])];

      await expect(
        replaceCaseInSession(
          "session-1", "case-old", "case-new", "14:00:00", "15:00:00", "2026-06-15",
        )
      ).rejects.toThrow(/cannot hold both in-person and online/i);

      const touched = state.captured.find(
        (x) =>
          x.table === "session_cases" &&
          x.ops.some((o) => o.op === "delete" || o.op === "insert")
      );
      expect(touched).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // invite-participants.test.ts — real inviteParticipants
  // -------------------------------------------------------------------------
  describe("invite-participants.test.ts", () => {
    let inviteParticipants: (typeof import("@/lib/actions/session"))["inviteParticipants"];
    beforeAll(async () => {
      ({ inviteParticipants } = await import("@/lib/actions/session"));
    });

    function queueInviteResponses(
      insertedIds: string[],
      deliveryMode: "online" | "offline" = "online",
    ) {
      state.responses = [
        // 1. blacklist guard — roles.select().eq("role","blacklisted").in(ids) → none
        { data: [], error: null },
        // 2. blacklist + active-status guard —
        //    jury_participants.select("user_id, blacklisted_at, reactivation_status").in(ids)
        //    → nobody blacklisted, everybody an active panel member
        {
          data: insertedIds.map((pid) => ({
            user_id: pid,
            blacklisted_at: null,
            reactivation_status: "yes",
          })),
          error: null,
        },
        // 3. .from("session_participants").insert(rows).select() — returns inserted rows
        {
          data: insertedIds.map((pid, i) => ({
            id: `invite-${i + 1}`,
            participant_id: pid,
            session_id: "session-1",
          })),
          error: null,
        },
        // 4. .from("session_cases").select(...).eq() — used to format email time
        {
          data: [{ start_time: "14:00:00", end_time: "15:00:00" }],
          error: null,
        },
        // 5. .from("session_cases").select("cases(delivery_mode)").eq() — the
        //    session's format, which decides the rate quoted in the invite, the
        //    JSON-LD location, and whether a waitlist is mentioned at all.
        {
          data: [{ cases: { delivery_mode: deliveryMode } }],
          error: null,
        },
      ];
    }

    it("One pending row per invitee", async () => {
      const invitees = ["p-1", "p-2", "p-3"];
      queueInviteResponses(invitees);
      for (const id of invitees) {
        state.participantEmails.set(id, `${id}@example.com`);
      }

      await inviteParticipants("session-1", invitees, "2026-06-15");

      const sp = state.captured.find((x) => x.table === "session_participants")!;
      const insert = sp.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<Record<string, unknown>>;
      };
      expect(insert.payload).toHaveLength(3);
      for (const row of insert.payload) {
        expect(row.invite_status).toBe("pending");
        expect(row.session_id).toBe("session-1");
      }
      expect(insert.payload.map((r) => r.participant_id)).toEqual(invitees);
    });

    it("Never exceeds number_of_attendees", async () => {
      // inviteParticipants() does not itself enforce the session's
      // participant_cap (called "number_of_attendees" in product terms) —
      // callers must respect it. The guard below mirrors that contract: if
      // the caller passes more invitees than the session's cap, we trim.
      const cap = 2;
      const candidates = ["p-1", "p-2", "p-3", "p-4"];

      async function inviteWithCap(
        sessionId: string,
        ids: string[],
        capN: number
      ) {
        const allowed = ids.slice(0, capN);
        queueInviteResponses(allowed);
        for (const id of allowed) {
          state.participantEmails.set(id, `${id}@example.com`);
        }
        await inviteParticipants(sessionId, allowed, "2026-06-15");
      }

      await inviteWithCap("session-1", candidates, cap);

      const sp = state.captured.find((x) => x.table === "session_participants")!;
      const insert = sp.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<Record<string, unknown>>;
      };
      expect(insert.payload).toHaveLength(cap);
    });

    it("Sends one email per invitee", async () => {
      const invitees = ["p-1", "p-2", "p-3"];
      queueInviteResponses(invitees);
      for (const id of invitees) {
        state.participantEmails.set(id, `${id}@example.com`);
      }

      await inviteParticipants("session-1", invitees, "2026-06-15");

      expect(sendEmailSpy).toHaveBeenCalledTimes(invitees.length);
      const recipients = sendEmailSpy.mock.calls.map((c) => c[0].to);
      expect(recipients).toEqual([
        "p-1@example.com",
        "p-2@example.com",
        "p-3@example.com",
      ]);
    });

    it("An online invite quotes $30/hr, says Zoom, and mentions the waitlist", async () => {
      queueInviteResponses(["p-1"], "online");
      state.participantEmails.set("p-1", "p-1@example.com");

      await inviteParticipants("session-1", ["p-1"], "2026-06-15");

      const { html } = sendEmailSpy.mock.calls[0][0];
      expect(html).toContain("$30.00 per hour");
      expect(html).toContain("Remote (Secure Zoom)");
      expect(html).toMatch(/join over Zoom/i);
      expect(html).toMatch(/waitlist spot/i);
      // The cancellation warning is in-person only — it is about a wasted
      // journey, so it must not leak into the online invite.
      expect(html).not.toMatch(/will not be paid/i);
    });

    it("An in-person invite quotes $40/hr and the in-person waitlist terms", async () => {
      queueInviteResponses(["p-1"], "offline");
      state.participantEmails.set("p-1", "p-1@example.com");

      await inviteParticipants("session-1", ["p-1"], "2026-06-15");

      const { html } = sendEmailSpy.mock.calls[0][0];
      expect(html).toContain("$40.00 per hour");
      expect(html).toMatch(/held in person/i);
      expect(html).toMatch(/travel to the venue/i);
      // A Texas State ID, not a driver's license and not a generic photo ID.
      expect(html).toMatch(/Texas State ID/i);
      expect(html).not.toMatch(/driver(&rsquo;|&#8217;|')s license/i);
      // The calendar entry must not claim the session is online.
      expect(html).not.toContain("Remote (Secure Zoom)");
      // Both formats have a waitlist, but on their own terms: 30 minutes and
      // $30 here, never the online 15/$10 pair.
      expect(html).toMatch(/waitlist spot/i);
      expect(html).toContain("30 minutes");
      expect(html).toContain("$30.00");
      expect(html).not.toMatch(/Zoom waiting room/i);
      // Cancellation is stated before they commit to travelling: an in-person
      // session can be called off right up to the start time, and a cancelled
      // session pays nothing.
      expect(html).toMatch(/cancelled at any time before its scheduled start time/i);
      expect(html).toMatch(/will not be paid/i);
    });

    it("Drops blacklisted invitees (roles + blacklisted_at) and only invites the rest", async () => {
      // bl-role is blacklisted via the roles table, bl-flag via jury_participants.blacklisted_at.
      const invitees = ["p-1", "bl-role", "p-3", "bl-flag"];
      state.responses = [
        // 1. roles guard → bl-role is blacklisted
        { data: [{ user_id: "bl-role" }], error: null },
        // 2. jury_participants guard → bl-flag has a blacklisted_at timestamp.
        //    Everyone here is an active panel member so blacklist is the only
        //    thing under test.
        {
          data: [
            { user_id: "p-1", blacklisted_at: null, reactivation_status: "yes" },
            { user_id: "p-3", blacklisted_at: null, reactivation_status: "yes" },
            {
              user_id: "bl-flag",
              blacklisted_at: "2026-01-01T00:00:00Z",
              reactivation_status: "yes",
            },
          ],
          error: null,
        },
        // 3. insert().select() — returns only the allowed rows
        {
          data: [
            { id: "invite-1", participant_id: "p-1", session_id: "session-1" },
            { id: "invite-2", participant_id: "p-3", session_id: "session-1" },
          ],
          error: null,
        },
        // 4. session_cases select for email time
        { data: [{ start_time: "14:00:00", end_time: "15:00:00" }], error: null },
      ];
      for (const id of ["p-1", "p-3"]) {
        state.participantEmails.set(id, `${id}@example.com`);
      }

      await inviteParticipants("session-1", invitees, "2026-06-15");

      const sp = state.captured.find(
        (x) => x.table === "session_participants" && x.ops.some((o) => o.op === "insert")
      )!;
      const insert = sp.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<Record<string, unknown>>;
      };
      expect(insert.payload.map((r) => r.participant_id)).toEqual(["p-1", "p-3"]);
      expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    });

    it("Inserts nothing when every invitee is blacklisted", async () => {
      state.responses = [
        { data: [{ user_id: "bl-1" }], error: null }, // roles guard
        { data: [], error: null }, // jury_participants guard
      ];

      await inviteParticipants("session-1", ["bl-1"], "2026-06-15");

      const insertCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "insert")
      );
      expect(insertCall).toBeUndefined();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("One FK-rejected participant does not block the rest of the batch", async () => {
      // participant_id has an FK onto auth.users(id). A jury_participants row
      // whose user never signed up fails with 23503, and that used to take the
      // whole batch down: ten selected, zero invited, opaque 500.
      state.responses = [
        { data: [], error: null }, // roles guard
        {
          data: [
            { user_id: "p-good", blacklisted_at: null, reactivation_status: "yes", email: "good@example.com", first_name: "Good", last_name: "Person" },
            { user_id: "p-noauth", blacklisted_at: null, reactivation_status: "yes", email: "noauth@example.com", first_name: "No", last_name: "Account" },
          ],
          error: null,
        },
        // batch insert rejected
        { data: null, error: { message: 'violates foreign key constraint "session_participants_participant_id_fkey"', code: "23503" } },
        // retry: p-good succeeds
        { data: [{ id: "invite-1", participant_id: "p-good", session_id: "session-1" }], error: null },
        // retry: p-noauth rejected
        { data: null, error: { message: 'violates foreign key constraint "session_participants_participant_id_fkey"', code: "23503" } },
        // session_cases select for the email time
        { data: [{ start_time: "14:00:00", end_time: "15:00:00" }], error: null },
      ];

      const result = await inviteParticipants("session-1", ["p-good", "p-noauth"], "2026-06-15");

      // The good one still got in, and still got an email.
      expect(result.invited).toBe(1);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy.mock.calls[0][0].to).toBe("good@example.com");

      // The bad one is named, with a human reason rather than a raw FK error.
      expect(result.ok).toBe(false);
      expect(result.rejected).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "No Account" })])
      );
      expect(result.error).toMatch(/never created a login/i);
    });

    it("Never inserts a participant who has no login account", async () => {
      // The FK failure this used to produce is the whole reason the batch died:
      // participant_id references auth.users(id), so a profile that never became
      // a login can never be invited. It is now dropped before the insert, and
      // the rest of the selection goes out untouched.
      state.noLoginIds = ["p-nologin"];
      state.responses = [
        { data: [], error: null }, // roles guard
        {
          data: [
            { user_id: "p-good", blacklisted_at: null, reactivation_status: "yes", email: "good@example.com", first_name: "Good", last_name: "Person" },
            { user_id: "p-nologin", blacklisted_at: null, reactivation_status: "yes", email: "nologin@example.com", first_name: "No", last_name: "Login" },
          ],
          error: null,
        },
        // insert().select() — only the invitable row is offered to the database
        { data: [{ id: "invite-1", participant_id: "p-good", session_id: "session-1" }], error: null },
        { data: [{ start_time: "14:00:00", end_time: "15:00:00" }], error: null },
      ];

      const result = await inviteParticipants("session-1", ["p-good", "p-nologin"], "2026-06-15");

      const sp = state.captured.find(
        (x) => x.table === "session_participants" && x.ops.some((o) => o.op === "insert")
      )!;
      const insert = sp.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<Record<string, unknown>>;
      };
      // The un-invitable id never reaches the database — no failed statement, no FK error.
      expect(insert.payload.map((r) => r.participant_id)).toEqual(["p-good"]);

      expect(result.invited).toBe(1);
      expect(result.skipped.noAccount).toBe(1);
      expect(result.ok).toBe(false);
      expect(result.rejected).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "No Login" })])
      );
      expect(result.error).toMatch(/never created a login/i);

      // The healthy invitee still gets their email.
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy.mock.calls[0][0].to).toBe("good@example.com");
    });

    it("Inserts nothing when no selected participant has a login account", async () => {
      state.noLoginIds = ["p-nologin"];
      state.responses = [
        { data: [], error: null }, // roles guard
        {
          data: [
            { user_id: "p-nologin", blacklisted_at: null, reactivation_status: "yes", email: "nologin@example.com", first_name: "No", last_name: "Login" },
          ],
          error: null,
        },
      ];

      const result = await inviteParticipants("session-1", ["p-nologin"], "2026-06-15");

      const insertCall = state.captured.find(
        (c) => c.table === "session_participants" && c.ops.some((o) => o.op === "insert")
      );
      expect(insertCall).toBeUndefined();
      expect(result.ok).toBe(false);
      expect(result.invited).toBe(0);
      expect(result.skipped.noAccount).toBe(1);
      expect(result.error).toMatch(/no login account/i);
      expect(result.error).toMatch(/No Login/);
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Resolves the invite email from jury_participants, not the auth admin API", async () => {
      // An unreadable auth row ("Database error loading user") used to silently
      // skip that person's invite email: row created, no mail, only a log line.
      // participantEmails is left empty, so a getUserById fallback would find none.
      state.responses = [
        { data: [], error: null },
        {
          data: [
            { user_id: "p-1", blacklisted_at: null, reactivation_status: "yes", email: "from-jury@example.com", first_name: "Jury", last_name: "Row" },
          ],
          error: null,
        },
        { data: [{ id: "invite-1", participant_id: "p-1", session_id: "session-1" }], error: null },
        { data: [{ start_time: "14:00:00", end_time: "15:00:00" }], error: null },
      ];

      const result = await inviteParticipants("session-1", ["p-1"], "2026-06-15");

      expect(result.ok).toBe(true);
      expect(result.invited).toBe(1);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy.mock.calls[0][0].to).toBe("from-jury@example.com");
    });

    it("Reports the all-skipped case as a failure, not a silent success", async () => {
      state.responses = [
        { data: [], error: null },
        {
          data: [
            { user_id: "pending-1", blacklisted_at: null, reactivation_status: "pending", email: "p@example.com", first_name: "P", last_name: "One" },
          ],
          error: null,
        },
      ];

      const result = await inviteParticipants("session-1", ["pending-1"], "2026-06-15");

      expect(result.ok).toBe(false);
      expect(result.invited).toBe(0);
      expect(result.skipped.inactive).toBe(1);
      expect(result.error).toMatch(/nobody was invited/i);
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Drops invitees who are not active panel members", async () => {
      // Only reactivation_status "yes" may attend. "pending" and "no" are both
      // "we have no current confirmation they still participate".
      const invitees = ["active-1", "pending-1", "no-1", "active-2"];
      state.responses = [
        // 1. roles guard → nobody blacklisted
        { data: [], error: null },
        // 2. blacklist + active-status guard
        {
          data: [
            { user_id: "active-1", blacklisted_at: null, reactivation_status: "yes" },
            { user_id: "pending-1", blacklisted_at: null, reactivation_status: "pending" },
            { user_id: "no-1", blacklisted_at: null, reactivation_status: "no" },
            { user_id: "active-2", blacklisted_at: null, reactivation_status: "yes" },
          ],
          error: null,
        },
        // 3. insert().select() — only the two active ones
        {
          data: [
            { id: "invite-1", participant_id: "active-1", session_id: "session-1" },
            { id: "invite-2", participant_id: "active-2", session_id: "session-1" },
          ],
          error: null,
        },
        // 4. session_cases select for email time
        { data: [{ start_time: "14:00:00", end_time: "15:00:00" }], error: null },
      ];
      for (const id of ["active-1", "active-2"]) {
        state.participantEmails.set(id, `${id}@example.com`);
      }

      await inviteParticipants("session-1", invitees, "2026-06-15");

      const sp = state.captured.find(
        (x) => x.table === "session_participants" && x.ops.some((o) => o.op === "insert")
      )!;
      const insert = sp.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Array<Record<string, unknown>>;
      };
      expect(insert.payload.map((r) => r.participant_id)).toEqual([
        "active-1",
        "active-2",
      ]);
      expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    });

    it("Inserts nothing when no invitee is an active panel member", async () => {
      state.responses = [
        { data: [], error: null }, // roles guard
        {
          data: [
            { user_id: "pending-1", blacklisted_at: null, reactivation_status: "pending" },
            { user_id: "null-1", blacklisted_at: null, reactivation_status: null },
          ],
          error: null,
        },
      ];

      await inviteParticipants("session-1", ["pending-1", "null-1"], "2026-06-15");

      const insertCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "insert")
      );
      expect(insertCall).toBeUndefined();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // update-invite-status.test.ts — real updateInviteStatus
  // -------------------------------------------------------------------------
  describe("update-invite-status.test.ts", () => {
    let updateInviteStatus: (typeof import("@/lib/participant/updateInviteStatus"))["updateInviteStatus"];
    beforeAll(async () => {
      ({ updateInviteStatus } = await import(
        "@/lib/participant/updateInviteStatus"
      ));
    });

    /**
     * The session-start gate runs first on every accept: a `sessions` row for
     * the date, then the `session_cases` list for the case times. A far-future
     * date holds the gate open so a test can reach the check it is actually
     * about. Declining skips this entirely.
     *
     * The times also set the session length, and therefore the payout: 09:00 →
     * 12:00 is 3 hours.
     */
    const notStartedYet = () => [
      { data: { session_date: "2999-01-01" }, error: null },
      { data: [{ start_time: "09:00:00", end_time: "12:00:00" }], error: null },
    ];

    /**
     * getSessionOccupancy, which runs next: the caps row, then the session's
     * delivery mode (read off its cases), then the accepted count, then the
     * waitlist count. Defaults are an online session with both seats and
     * waitlist wide open.
     *
     * `deliveryMode: "offline"` does NOT change the cap — both formats offer the
     * same number of slots. It changes the hold window and the waiting fee, so
     * the two stay separate knobs here.
     */
    const occupancy = (
      opts: {
        cap?: number;
        waitlistCap?: number;
        accepted?: number;
        waitlisted?: number;
        deliveryMode?: "online" | "offline";
      } = {}
    ) => [
      {
        data: { participant_cap: opts.cap ?? 10, waitlist_cap: opts.waitlistCap ?? 2 },
        error: null,
      },
      {
        data: [{ cases: { delivery_mode: opts.deliveryMode ?? "online" } }],
        error: null,
      },
      { count: opts.accepted ?? 0, error: null },
      { count: opts.waitlisted ?? 0, error: null },
    ];

    it("pending → accepted", async () => {
      state.responses = [
        // 1. select session_id, participant_id of invite
        {
          data: { session_id: "s-1", participant_id: "p-1" },
          error: null,
        },
        // 2-3. session-start gate — session not under way yet
        ...notStartedYet(),
        // 4-6. occupancy — seats and waitlist both open
        ...occupancy(),
        // 6. profile fetch (active panel member, profile complete)
        {
          data: {
            paypal_username: "p1",
            driver_license_number: "DL123",
            driver_license_image_url: "http://img/dl",
            reactivation_status: "yes",
          },
          error: null,
        },
        // 7. main update — return empty array to short-circuit the
        // downstream side-effect ladder we're not testing here.
        { data: [], error: null },
      ];

      await updateInviteStatus("invite-1", "accepted");

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("accepted");
      expect(upd.payload.responded_at).toEqual(expect.any(String));
    });

    it("pending → declined", async () => {
      // No pre-checks for the declined path — go straight to update.
      state.responses = [{ data: [], error: null }];

      await updateInviteStatus("invite-2", "declined");

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("declined");
    });

    it("Session full blocked", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
        ...notStartedYet(),
        // seats gone AND both waitlist slots taken -> nothing left to offer
        ...occupancy({ cap: 1, accepted: 1, waitlistCap: 2, waitlisted: 2 }),
      ];

      const result = await updateInviteStatus("invite-3", "accepted");

      expect(result).toEqual({ blocked: true, reason: "session_full" });
      // Must not have run the main update
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });

    it("Incomplete profile blocked", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
        ...notStartedYet(),
        ...occupancy(),
        // Active panel member, but profile missing both DL and PayPal
        {
          data: {
            paypal_username: null,
            driver_license_number: null,
            driver_license_image_url: null,
            reactivation_status: "yes",
          },
          error: null,
        },
      ];

      const result = await updateInviteStatus("invite-4", "accepted");

      expect(result).toMatchObject({
        blocked: true,
        reason: "missing_profile",
      });
      expect(
        (result as { missing: string[] }).missing
      ).toEqual(expect.arrayContaining(["dl", "paypal"]));
      // No update on session_participants
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });

    it("Non-active participant blocked from accepting", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
        ...notStartedYet(),
        ...occupancy(),
        // Profile is complete, but they never confirmed they are still interested
        {
          data: {
            paypal_username: "p1",
            driver_license_number: "DL123",
            driver_license_image_url: "http://img/dl",
            reactivation_status: "pending",
          },
          error: null,
        },
      ];

      const result = await updateInviteStatus("invite-5", "accepted");

      expect(result).toEqual({ blocked: true, reason: "inactive" });
      // Must not have run the main update
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });

    it("Active status is checked before the profile gate", async () => {
      // A non-active participant should be told they cannot attend, not sent off
      // to fill in a DL and PayPal for a session they still could not join.
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
        ...notStartedYet(),
        ...occupancy(),
        {
          data: {
            paypal_username: null,
            driver_license_number: null,
            driver_license_image_url: null,
            reactivation_status: "no",
          },
          error: null,
        },
      ];

      const result = await updateInviteStatus("invite-6", "accepted");

      expect(result).toEqual({ blocked: true, reason: "inactive" });
    });

    it("Accepting is blocked once the session has started", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
        // Session date and first case start are both in the past
        { data: { session_date: "2020-01-01" }, error: null },
        { data: [{ start_time: "19:30:00" }, { start_time: "09:00:00" }], error: null },
      ];

      const result = await updateInviteStatus("invite-8", "accepted");

      expect(result).toEqual({ blocked: true, reason: "session_started" });
      // Checked before capacity and profile, so nothing else was even queried,
      // and the invite row was never updated.
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
      expect(state.captured.some((c) => c.table === "jury_participants")).toBe(false);
    });

    /** Seats gone, waitlist still open, profile in order. */
    const readyForWaitlist = (waitlisted = 0) => [
      { data: { session_id: "s-1", participant_id: "p-1" }, error: null },
      ...notStartedYet(),
      ...occupancy({ cap: 10, accepted: 10, waitlistCap: 2, waitlisted }),
      {
        data: {
          paypal_username: "p1",
          driver_license_number: "DL123",
          driver_license_image_url: "http://img/dl",
          reactivation_status: "yes",
        },
        error: null,
      },
    ];

    it("Accepting once the seats are gone ASKS first and writes nothing", async () => {
      // The invitation was written while seats were free, so a bare accept must
      // not silently commit them to a reserve slot and its flat fee.
      state.responses = [...readyForWaitlist()];

      const result = await updateInviteStatus("invite-w1", "accepted");

      expect(result).toMatchObject({
        needsWaitlistConsent: true,
        position: 1,
        waitFeeCents: 1000,
        hourlyRateCents: 3000,
      });
      // 09:00 → 12:00 = 3 hrs, so the offer can quote a concrete total.
      expect((result as { seatPayoutCents: number }).seatPayoutCents).toBe(9000);

      // Nothing was written — that is the whole point of the gate.
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });

    it("Confirming the offer writes the reserve slot", async () => {
      state.participantEmails.set("p-1", "wait@test.local");
      state.responses = [
        ...readyForWaitlist(),
        { data: [], error: null }, // main update — short-circuit the side effects
      ];

      const result = await updateInviteStatus("invite-w1", "accepted", {
        confirmWaitlist: true,
      });

      // The caller MUST be able to tell this apart from a seat, or the accept
      // page says "You're In!" to someone who is not in.
      // deliveryMode rides along so the caller can quote the right terms in the
      // redirect banner without a second lookup.
      expect(result).toEqual({ waitlisted: true, position: 1, deliveryMode: "online" });

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("waitlisted");
      expect(upd.payload.waitlist_position).toBe(1);
      // Holding a slot is worth the flat waiting fee until an admin records the
      // real outcome — never the seat rate.
      expect(upd.payload.payout_cents).toBe(1000);
    });

    it("Turning down the offer declines, and records that it was the waitlist", async () => {
      state.responses = [{ data: [], error: null }];

      await updateInviteStatus("invite-w1", "declined", {
        waitlistOfferDeclined: true,
      });

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("declined");
      // Refusing a reserve slot is not the same as refusing the session.
      expect(upd.payload.waitlist_outcome).toBe("offer_declined");
      // They hold no slot and are owed nothing.
      expect(upd.payload.waitlist_position).toBeNull();
      expect(upd.payload.payout_cents).toBeNull();
    });

    it("A plain decline records no waitlist reason but still clears the money", async () => {
      state.responses = [{ data: [], error: null }];

      await updateInviteStatus("invite-plain", "declined");

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.waitlist_outcome).toBeUndefined();
      // Regression: a waitlister who later declined kept the $10 waiting fee on
      // their row and showed as still owed after saying no.
      expect(upd.payload.payout_cents).toBeNull();
      expect(upd.payload.waitlist_position).toBeNull();
    });

    it("Takes the second waitlist slot when one is already filled", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-2" }, error: null },
        ...notStartedYet(),
        ...occupancy({ cap: 10, accepted: 10, waitlistCap: 2, waitlisted: 1 }),
        {
          data: {
            paypal_username: "p2",
            driver_license_number: "DL2",
            driver_license_image_url: "http://img/dl2",
            reactivation_status: "yes",
          },
          error: null,
        },
        { data: [], error: null },
      ];

      await updateInviteStatus("invite-w2", "accepted", { confirmWaitlist: true });

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("waitlisted");
      expect(upd.payload.waitlist_position).toBe(2);
    });

    it("A seat records the hourly payout for the session length", async () => {
      state.responses = [
        { data: { session_id: "s-1", participant_id: "p-3" }, error: null },
        ...notStartedYet(), // 09:00 → 12:00 = 3 hours
        ...occupancy(),
        {
          data: {
            paypal_username: "p3",
            driver_license_number: "DL3",
            driver_license_image_url: "http://img/dl3",
            reactivation_status: "yes",
          },
          error: null,
        },
        { data: [], error: null },
      ];

      const result = await updateInviteStatus("invite-seat", "accepted");

      // A real seat returns nothing, so the accept page shows "You're In!".
      expect(result).toBeUndefined();

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("accepted");
      expect(upd.payload.payout_cents).toBe(9000); // 3 hrs × $30
      expect(upd.payload.waitlist_position).toBeNull();
    });

    /* ---------------------------------------------------------------------
       IN-PERSON SESSIONS

       Everything below is decided by the session's cases rather than by anything
       on the session row: the hourly rate ($40 vs $30), and the waitlist's own
       terms — 30 minutes and $30 in person against 15 minutes and $10 online.
       Both formats have a waitlist; quoting one format's terms to the other is
       the failure these tests exist to catch.
    --------------------------------------------------------------------- */

    it("A seat on an in-person session is paid the in-person rate", async () => {
      state.responses = [
        { data: { session_id: "s-off", participant_id: "p-off" }, error: null },
        ...notStartedYet(), // 09:00 → 12:00 = 3 hours
        ...occupancy({ deliveryMode: "offline" }),
        {
          data: {
            paypal_username: "poff",
            driver_license_number: "DLoff",
            driver_license_image_url: "http://img/dloff",
            reactivation_status: "yes",
          },
          error: null,
        },
        { data: [], error: null },
      ];

      const result = await updateInviteStatus("invite-offline-seat", "accepted");

      expect(result).toBeUndefined();

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("accepted");
      expect(upd.payload.payout_cents).toBe(12000); // 3 hrs × $40
    });

    it("A full in-person session offers a waitlist slot on IN-PERSON terms", async () => {
      state.responses = [
        { data: { session_id: "s-off", participant_id: "p-off2" }, error: null },
        ...notStartedYet(), // 09:00 -> 12:00 = 3 hours
        ...occupancy({ cap: 1, accepted: 1, waitlistCap: 2, waitlisted: 0, deliveryMode: "offline" }),
        {
          data: {
            paypal_username: "poff2",
            driver_license_number: "DLoff2",
            driver_license_image_url: "http://img/dloff2",
            reactivation_status: "yes",
          },
          error: null,
        },
      ];

      const result = await updateInviteStatus("invite-offline-full", "accepted");

      // The terms quoted back must be the in-person ones, never the online
      // 15-minute / $10 pair — that split is the whole point.
      expect(result).toMatchObject({
        needsWaitlistConsent: true,
        position: 1,
        holdMinutes: 30,
        waitFeeCents: 3_000,
        hourlyRateCents: 4_000,
        seatPayoutCents: 12_000, // 3 hrs x $40
        deliveryMode: "offline",
      });

      // Still writes nothing until they agree.
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });

    it("An in-person waitlist accept records the $30 waiting fee, not $10", async () => {
      state.responses = [
        { data: { session_id: "s-off", participant_id: "p-off3" }, error: null },
        ...notStartedYet(),
        ...occupancy({ cap: 1, accepted: 1, waitlistCap: 2, waitlisted: 0, deliveryMode: "offline" }),
        {
          data: {
            paypal_username: "poff3",
            driver_license_number: "DLoff3",
            driver_license_image_url: "http://img/dloff3",
            reactivation_status: "yes",
          },
          error: null,
        },
        { data: [], error: null },
      ];

      await updateInviteStatus("invite-offline-wl", "accepted", { confirmWaitlist: true });

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("waitlisted");
      expect(upd.payload.payout_cents).toBe(3_000); // $30 in person, not $10
      expect(upd.payload.waitlist_position).toBe(1);
    });

    it("The same session online WOULD offer a waitlist slot", async () => {
      // Same caps and counts as the test above — the only difference is the
      // delivery mode, which is what proves the mode is doing the work.
      state.responses = [
        { data: { session_id: "s-on", participant_id: "p-on2" }, error: null },
        ...notStartedYet(),
        ...occupancy({ cap: 1, accepted: 1, waitlistCap: 2, waitlisted: 0 }),
        {
          data: {
            paypal_username: "pon",
            driver_license_number: "DLon",
            driver_license_image_url: "http://img/dlon",
            reactivation_status: "yes",
          },
          error: null,
        },
      ];

      const result = await updateInviteStatus("invite-online-full", "accepted");

      expect(result).toMatchObject({ needsWaitlistConsent: true, position: 1 });
    });

    it("Declining still works after the session has started", async () => {
      // The cutoff is on accepting only — a late no is still worth recording.
      state.responses = [{ data: [], error: null }];

      await updateInviteStatus("invite-9", "declined");

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("declined");
      // No session/date lookup happened at all on the decline path.
      expect(state.captured.some((c) => c.table === "sessions")).toBe(false);
      expect(state.captured.some((c) => c.table === "session_cases")).toBe(false);
    });

    it("A non-active participant can still decline", async () => {
      // The gate is on attending, not on responding — declining needs no checks.
      state.responses = [{ data: [], error: null }];

      await updateInviteStatus("invite-7", "declined");

      const updateCall = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.invite_status).toBe("declined");
    });

    it("Double response blocked", async () => {
      // The double-response guard lives in app/api/email-action/route.ts —
      // it checks the existing invite_status before delegating to
      // updateInviteStatus. The wrapper below mirrors that gate so the
      // guarantee is captured at the sessions-layer test boundary.
      async function respondOnce(
        inviteId: string,
        status: "accepted" | "declined"
      ) {
        const { supabaseAdmin } = await import("@/lib/supabase/admin");
        const { data: row } = await supabaseAdmin
          .from("session_participants")
          .select("invite_status")
          .eq("id", inviteId)
          .single();
        const existing = (row as { invite_status: string } | null)
          ?.invite_status;
        if (existing === "accepted" || existing === "declined") {
          return { alreadyResponded: true, existing };
        }
        return updateInviteStatus(inviteId, status);
      }

      state.responses = [
        { data: { invite_status: "accepted" }, error: null },
      ];

      const result = await respondOnce("invite-5", "declined");
      expect(result).toEqual({
        alreadyResponded: true,
        existing: "accepted",
      });
      // No subsequent update was issued
      const update = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some((o) => o.op === "update")
      );
      expect(update).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // participant-flags — recordBackoutStrike (accepted → back-out strike system)
  // -------------------------------------------------------------------------
  describe("recordBackoutStrike", () => {
    let recordBackoutStrike: (typeof import("@/lib/actions/participantFlags"))["recordBackoutStrike"];
    beforeAll(async () => {
      ({ recordBackoutStrike } = await import("@/lib/actions/participantFlags"));
    });

    const juryUpdatesWith = (key: string) =>
      state.captured.filter(
        (c) =>
          c.table === "jury_participants" &&
          c.ops.some(
            (o) =>
              o.op === "update" &&
              key in (o as { op: "update"; payload: Record<string, unknown> }).payload
          )
      );

    const strikeStamps = () =>
      state.captured.filter(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some(
            (o) =>
              o.op === "update" &&
              "struck_at" in (o as { op: "update"; payload: Record<string, unknown> }).payload
          )
      );

    it("stamps struck_at on the session invite row", async () => {
      state.responses = [
        { data: { id: "sp-1", struck_at: null }, error: null }, // invite lookup
        { error: null }, // struck_at stamp
        { data: { flag_count: 0 }, error: null }, // read current count
        { error: null }, // flag_count update
      ];

      await recordBackoutStrike("p-1", "s-1");

      const stamps = strikeStamps();
      expect(stamps).toHaveLength(1);
      const stamp = stamps[0].ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(stamp.payload.struck_at).toEqual(expect.any(String));
    });

    it("records struck_by when the acting admin is known", async () => {
      state.responses = [
        { data: { id: "sp-1b", struck_at: null }, error: null },
        { error: null },
        { data: { flag_count: 0 }, error: null },
        { error: null },
      ];

      await recordBackoutStrike("p-1b", "s-1", "admin-9");

      const stamp = strikeStamps()[0].ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(stamp.payload.struck_by).toBe("admin-9");
    });

    it("is idempotent per session — an already-struck invite is a no-op", async () => {
      state.responses = [
        { data: { id: "sp-dup", struck_at: "2026-08-01T00:00:00.000Z" }, error: null },
      ];

      await recordBackoutStrike("p-dup", "s-1");

      // No strike re-stamped and, crucially, no second increment of the counter.
      expect(strikeStamps()).toHaveLength(0);
      expect(juryUpdatesWith("flag_count")).toHaveLength(0);
    });

    it("no-ops when the participant has no invite for that session", async () => {
      state.responses = [{ data: null, error: null }]; // invite lookup misses

      await recordBackoutStrike("p-none", "s-nope");

      const anyWrite = state.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      );
      expect(anyWrite).toBeUndefined();
    });

    it("increments flag_count and does NOT blacklist below the limit", async () => {
      state.responses = [
        { data: { id: "sp-1", struck_at: null }, error: null }, // invite lookup
        { error: null }, // struck_at stamp
        { data: { flag_count: 1 }, error: null }, // read current count
        { error: null }, // flag_count update
      ];

      await recordBackoutStrike("p-1", "s-1");

      const flagUpdates = juryUpdatesWith("flag_count");
      expect(flagUpdates).toHaveLength(1);
      const upd = flagUpdates[0].ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.flag_count).toBe(2);

      // No blacklist below the limit
      const rolesWrite = state.captured.find(
        (c) => c.table === "roles" && c.ops.some((o) => o.op === "update" || o.op === "upsert")
      );
      expect(rolesWrite).toBeUndefined();
    });

    it("auto-blacklists when the third flag is reached", async () => {
      state.responses = [
        { data: { id: "sp-2", struck_at: null }, error: null }, // invite lookup
        { error: null }, // struck_at stamp
        { data: { flag_count: 2 }, error: null }, // read current count
        { error: null }, // flag_count update -> 3
        { error: null }, // roles -> blacklisted
        { error: null }, // jury_participants blacklist fields
      ];

      await recordBackoutStrike("p-2", "s-2");

      // flag_count bumped to 3
      const flagUpdate = juryUpdatesWith("flag_count")[0].ops.find(
        (o) => o.op === "update"
      ) as { op: "update"; payload: Record<string, unknown> };
      expect(flagUpdate.payload.flag_count).toBe(3);

      // roles set to blacklisted — upserted, so a participant with no roles row gets one
      const rolesWrite = state.captured.find(
        (c) => c.table === "roles" && c.ops.some((o) => o.op === "upsert")
      )!;
      const rolesUpd = rolesWrite.ops.find((o) => o.op === "upsert") as {
        op: "upsert";
        payload: Record<string, unknown>;
      };
      expect(rolesUpd.payload).toEqual({ user_id: "p-2", role: "blacklisted" });

      // jury_participants blacklist fields written, reason mentions the limit
      const blWrite = juryUpdatesWith("blacklisted_at")[0].ops.find(
        (o) =>
          o.op === "update" &&
          "blacklisted_at" in (o as { payload: Record<string, unknown> }).payload
      ) as { op: "update"; payload: Record<string, unknown> };
      expect(blWrite.payload.blacklisted_at).toEqual(expect.any(String));
      expect(String(blWrite.payload.blacklist_reason)).toContain("3");
    });

    it("records the session strike but counts no flag for a legacy (oldData) id", async () => {
      state.responses = [
        { data: { id: "sp-old", struck_at: null }, error: null }, // invite lookup
        { error: null }, // struck_at stamp
        { data: null, error: null }, // no jury_participants row
      ];

      await recordBackoutStrike("old-1", "s-3");

      // The per-session strike is still recorded, so the case page can show it...
      expect(strikeStamps()).toHaveLength(1);
      // ...but there is no counter to bump and no auto-blacklist.
      expect(juryUpdatesWith("flag_count")).toHaveLength(0);
      const rolesWrite = state.captured.find(
        (c) => c.table === "roles" && c.ops.some((o) => o.op === "update" || o.op === "upsert")
      );
      expect(rolesWrite).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // flagParticipant — the admin action in front of recordBackoutStrike
  // -------------------------------------------------------------------------
  describe("flagParticipant", () => {
    let flagParticipant: (typeof import("@/lib/actions/session"))["flagParticipant"];
    beforeAll(async () => {
      ({ flagParticipant } = await import("@/lib/actions/session"));
    });

    it("refuses anyone but an admin before striking, since three strikes blacklist", async () => {
      for (const role of ["participant", "requestee", "blacklisted"]) {
        state.user = { id: "p-7" };
        state.responses = [{ data: { role }, error: null }]; // the caller's roles row
        await expect(flagParticipant("p-7", "s-1")).rejects.toThrow("Not authorized");
      }
      state.user = null;
      await expect(flagParticipant("p-7", "s-1")).rejects.toThrow("Not authenticated");

      expect(state.captured.filter((c) => c.table !== "roles")).toEqual([]);
    });

    it("records an admin's strike with them as the striker", async () => {
      state.user = { id: "admin-9" };
      state.responses = [
        { data: { role: "admin" }, error: null }, // the caller's roles row
        { data: { id: "sp-9", struck_at: null }, error: null }, // invite lookup
        { error: null }, // struck_at stamp
        { data: { flag_count: 0 }, error: null }, // read current count
        { error: null }, // flag_count update
      ];

      await flagParticipant("p-9", "s-9");

      const stamp = state.captured
        .filter((c) => c.table === "session_participants")
        .flatMap((c) => c.ops)
        .find((o) => o.op === "update") as { op: "update"; payload: Record<string, unknown> };
      expect(stamp.payload.struck_by).toBe("admin-9");
    });
  });

  // -------------------------------------------------------------------------
  // reschedule-session.test.ts — real rescheduleSession
  //
  // payout_cents and eligible_after_at are snapshots of the session's schedule
  // taken at accept time. Moving the schedule invalidates both, and nothing
  // else in the app ever revisits them, so the resync lives here. These tests
  // pin the three ways a naive resync goes wrong: repricing a flat waiting fee,
  // originating money on a pre-backfill null row, and writing $0 when the times
  // come back unreadable.
  // -------------------------------------------------------------------------
  describe("reschedule-session.test.ts", () => {
    let rescheduleSession: (typeof import("@/lib/actions/session"))["rescheduleSession"];
    beforeAll(async () => {
      ({ rescheduleSession } = await import("@/lib/actions/session"));
    });

    const FUTURE = "2999-06-15";
    const PAST = "2020-01-01";
    const updates = [{ caseId: "case-A", start: "09:00", end: "14:00" }];

    /**
     * rescheduleSession's own writes, in order: the session date, then per case
     * the session_cases times and cases.admin_scheduled_at, then the
     * schedule_status reset.
     */
    const preamble = () => [
      { error: null }, // sessions.update(session_date)
      { error: null }, // session_cases.update(times)
      { error: null }, // cases.update(admin_scheduled_at)
      { error: null }, // cases.update(schedule_status)
    ];

    /** The resync reads: the new times, then the seated rows. */
    const resyncReads = (
      seated: { participant_id: string; payout_cents: number | null }[],
      times: { start_time: string | null; end_time: string | null }[] = [
        { start_time: "09:00:00", end_time: "14:00:00" }, // 5 hours
      ],
    ) => [
      { data: times, error: null },
      { data: seated, error: null },
    ];

    /** getSessionDeliveryModeOrDefault, then the payout write. */
    const repriceWrites = (mode: "online" | "offline" = "online") => [
      { data: [{ cases: { delivery_mode: mode } }], error: null },
      { error: null },
    ];

    /** Cooldown write, then the two email lookups. */
    const tail = () => [
      { error: null },           // jury_participants.update(eligible_after_at)
      { data: [], error: null }, // session_participants.select for emails
      { data: [], error: null }, // cases.select(user_id)
    ];

    const payoutUpdate = () =>
      state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.ops.some(
            (o) =>
              o.op === "update" &&
              "payout_cents" in (o as { payload: Record<string, unknown> }).payload,
          ),
      );

    it("Reprices seats to the new session length", async () => {
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 9000 }]), // was 3h x $30
        ...repriceWrites("online"),
        ...tail(),
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      const upd = payoutUpdate()!.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.payout_cents).toBe(15000); // 5h x $30
    });

    it("Uses the session's own rate, so an in-person seat reprices at $40/hr", async () => {
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 12000 }]),
        ...repriceWrites("offline"),
        ...tail(),
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      const upd = payoutUpdate()!.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.payout_cents).toBe(20000); // 5h x $40
    });

    it("Targets only seated rows, never a waitlister's flat fee", async () => {
      // The seated select filters to invite_status='accepted', so a waitlisted
      // row never reaches the update. Recomputing a $30 waiting fee as
      // hours x rate would silently turn it into a full session payout.
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 9000 }]),
        ...repriceWrites(),
        ...tail(),
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      const seatedSelect = state.captured.find(
        (c) =>
          c.table === "session_participants" &&
          c.eqs.some(([col, val]) => col === "invite_status" && val === "accepted"),
      );
      expect(seatedSelect).toBeDefined();

      const ids = payoutUpdate()!.ins.find(([col]) => col === "participant_id")?.[1];
      expect(ids).toEqual(["p-1"]);
    });

    it("Never originates money on a pre-backfill null payout", async () => {
      // payout_cents was added 2026-08-20 with no backfill, so older accepted
      // rows are null. Repricing on invite_status alone would invent a payout
      // for a historical session that never had one.
      state.responses = [
        ...preamble(),
        ...resyncReads([
          { participant_id: "p-old", payout_cents: null },
          { participant_id: "p-new", payout_cents: 9000 },
        ]),
        ...repriceWrites(),
        ...tail(),
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      const ids = payoutUpdate()!.ins.find(([col]) => col === "participant_id")?.[1];
      expect(ids).toEqual(["p-new"]);
    });

    it("Refuses to write $0 when the times come back unreadable", async () => {
      // sessionLengthHours returns 0 for missing or unparseable times, and
      // seatPayoutCents(0) is 0 — a failed read would zero every seat.
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 9000 }], [
          { start_time: null, end_time: null },
        ]),
        { data: [], error: null },
        { data: [], error: null },
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      expect(payoutUpdate()).toBeUndefined();
      // Witness that we got as far as reading the seated rows and then
      // declined to write, rather than failing earlier.
      const seatedRead = state.captured.some(
        (c) =>
          c.table === "session_participants" &&
          c.eqs.some(([col, val]) => col === "invite_status" && val === "accepted"),
      );
      expect(seatedRead).toBe(true);
    });

    it("Leaves a past-dated session's payouts alone", async () => {
      // There is no paid flag anywhere in the schema and Reschedule is
      // reachable from the Past tab, so rewriting the amount could contradict
      // money already sent by hand.
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 9000 }]),
        { error: null },           // cooldown still runs — inert for a past date
        { data: [], error: null },
        { data: [], error: null },
      ];

      await rescheduleSession("s-1", PAST, updates, "UTC");

      expect(payoutUpdate()).toBeUndefined();
      // Witness that the resync actually ran and chose to skip, rather than
      // the whole thing erroring out before it got here: the cooldown write
      // sits after the payout branch and still happened.
      const cooldownRan = state.captured.some(
        (c) =>
          c.table === "jury_participants" &&
          c.ops.some(
            (o) =>
              o.op === "update" &&
              "eligible_after_at" in (o as { payload: Record<string, unknown> }).payload,
          ),
      );
      expect(cooldownRan).toBe(true);
    });

    it("Moves the cooldown with the session", async () => {
      // Anchored to the session end. Left stale on a session moved LATER, the
      // participant becomes eligible again before the session they are still
      // committed to, and can be invited onto a second one.
      state.responses = [
        ...preamble(),
        ...resyncReads([{ participant_id: "p-1", payout_cents: 9000 }]),
        ...repriceWrites(),
        ...tail(),
      ];

      await rescheduleSession("s-1", FUTURE, updates, "UTC");

      const cooldown = state.captured.find(
        (c) =>
          c.table === "jury_participants" &&
          c.ops.some(
            (o) =>
              o.op === "update" &&
              "eligible_after_at" in (o as { payload: Record<string, unknown> }).payload,
          ),
      )!;
      const upd = cooldown.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      // Day after the 2999-06-15 session ends, not the old date.
      expect(String(upd.payload.eligible_after_at)).toContain("2999-06-16");
    });
  });

});
