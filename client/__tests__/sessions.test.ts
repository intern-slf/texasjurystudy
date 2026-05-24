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
} = {
  user: null,
  responses: [],
  captured: [],
  rlsBlock: false,
  participantEmails: new Map(),
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

vi.mock("@/lib/mail", () => ({
  sendEmail: (args: SendEmailArgs) => sendEmailSpy(args),
  sendRescheduleEmail: vi.fn(async () => undefined),
  sendSessionCreatedEmail: vi.fn(async () => undefined),
  sendSessionCompletedEmail: vi.fn(async () => undefined),
  sendPresenceConfirmedEmail: vi.fn(async () => undefined),
  sendPresenceDeclinedEmail: vi.fn(async () => undefined),
  sendZoomLinkEmail: (...args: unknown[]) =>
    sendZoomLinkEmailSpy(...(args as [])),
  sendPresenterInfoEmail: vi.fn(async () => undefined),
  sendInviteAcceptedConfirmationEmail: (...args: unknown[]) =>
    sendInviteAcceptedConfirmationEmailSpy(...(args as [])),
  sendInviteDeclinedConfirmationEmail: (...args: unknown[]) =>
    sendInviteDeclinedConfirmationEmailSpy(...(args as [])),
  sendSessionFullEmail: (...args: unknown[]) =>
    sendSessionFullEmailSpy(...(args as [])),
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
    sendEmailSpy.mockClear();
    sendInviteAcceptedConfirmationEmailSpy.mockClear();
    sendInviteDeclinedConfirmationEmailSpy.mockClear();
    sendSessionFullEmailSpy.mockClear();
    sendZoomLinkEmailSpy.mockClear();
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

    it("Creates one row per case", async () => {
      state.responses = [
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

      const sc = state.captured.find((x) => x.table === "session_cases")!;
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

      const sc = state.captured.find((x) => x.table === "session_cases")!;
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
  });

  // -------------------------------------------------------------------------
  // invite-participants.test.ts — real inviteParticipants
  // -------------------------------------------------------------------------
  describe("invite-participants.test.ts", () => {
    let inviteParticipants: (typeof import("@/lib/actions/session"))["inviteParticipants"];
    beforeAll(async () => {
      ({ inviteParticipants } = await import("@/lib/actions/session"));
    });

    function queueInviteResponses(insertedIds: string[]) {
      state.responses = [
        // 1. .from("session_participants").insert(rows).select() — returns inserted rows
        {
          data: insertedIds.map((pid, i) => ({
            id: `invite-${i + 1}`,
            participant_id: pid,
            session_id: "session-1",
          })),
          error: null,
        },
        // 2. .from("session_cases").select(...).eq() — used to format email time
        {
          data: [{ start_time: "14:00:00", end_time: "15:00:00" }],
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

    it("pending → accepted", async () => {
      state.responses = [
        // 1. select session_id, participant_id of invite
        {
          data: { session_id: "s-1", participant_id: "p-1" },
          error: null,
        },
        // 2. isSessionFull → session row
        { data: { participant_cap: 10 }, error: null },
        // 3. isSessionFull → count
        { count: 0, error: null },
        // 4. profile fetch
        {
          data: {
            paypal_username: "p1",
            driver_license_number: "DL123",
            driver_license_image_url: "http://img/dl",
          },
          error: null,
        },
        // 5. main update — return empty array to short-circuit the
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
        { data: { participant_cap: 1 }, error: null },
        { count: 1, error: null }, // already at cap
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
        { data: { participant_cap: 10 }, error: null },
        { count: 0, error: null },
        // Profile missing both DL and PayPal
        {
          data: {
            paypal_username: null,
            driver_license_number: null,
            driver_license_image_url: null,
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
});
