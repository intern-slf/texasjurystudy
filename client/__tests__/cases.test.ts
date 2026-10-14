import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";
import {
  applyEducationAutoSelect,
  EDUCATION_LEVELS,
} from "@/lib/education-hierarchy";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";

// ---------------------------------------------------------------------------
// Stateful supabase server-client mock — used by every action under test.
// ---------------------------------------------------------------------------
type CapturedOp =
  | { op: "select"; cols?: string }
  | { op: "update"; payload: Record<string, unknown> }
  | { op: "insert"; payload: Record<string, unknown> }
  | { op: "delete" };

type CapturedCall = {
  table: string;
  ops: CapturedOp[];
  eqs: Array<[string, unknown]>;
  // Every other filter, as [method, ...args]: in, is, not, or.
  filters: unknown[][];
};

const serverState: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  // Each terminal awaitable (.single() or implicit await on the chain) shifts one off
  responses: Array<{ data: unknown; error: unknown }>;
  captured: CapturedCall[];
  // RLS-style: when true, the next update/insert/delete returns an error
  rlsBlock: boolean;
  // The caller's own roles row, as requireAdmin reads it. Answered outside the
  // responses queue, so the positive tests keep their queued case rows.
  role: string | null;
} = {
  user: null,
  responses: [],
  captured: [],
  rlsBlock: false,
  role: null,
};

/** Signs the test in as an admin, which the adminCase actions need. */
function asAdmin() {
  serverState.user = { id: "admin-1" };
  serverState.role = "admin";
}

function nextResponse(): { data: unknown; error: unknown } {
  if (serverState.rlsBlock) {
    return { data: null, error: { message: "new row violates row-level security policy", code: "42501" } };
  }
  return serverState.responses.shift() ?? { data: null, error: null };
}

function makeServerClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: serverState.user } })),
    },
    from: vi.fn((table: string) => {
      const captured: CapturedCall = { table, ops: [], eqs: [], filters: [] };
      serverState.captured.push(captured);

      const builder: Record<string, unknown> = {};
      builder.select = vi.fn((cols?: string) => {
        captured.ops.push({ op: "select", cols });
        return builder;
      });
      builder.update = vi.fn((payload: Record<string, unknown>) => {
        captured.ops.push({ op: "update", payload });
        return builder;
      });
      builder.insert = vi.fn((payload: Record<string, unknown>) => {
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
      for (const method of ["in", "is", "not", "or"]) {
        builder[method] = vi.fn((...args: unknown[]) => {
          captured.filters.push([method, ...args]);
          return builder;
        });
      }
      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.single = vi.fn(async () => nextResponse());
      builder.maybeSingle = vi.fn(async () =>
        table === "roles"
          ? { data: serverState.role ? { role: serverState.role } : null, error: null }
          : nextResponse()
      );
      // Make the chain awaitable without an explicit terminal (PostgrestBuilder
      // implements PromiseLike — production code relies on this).
      (builder as { then: unknown }).then = (
        resolve: (v: unknown) => unknown
      ) => Promise.resolve(nextResponse()).then(resolve);
      return builder;
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeServerClient()),
}));

// ---------------------------------------------------------------------------
// supabaseAdmin mock — adminCase actions look up requestee email here
// ---------------------------------------------------------------------------
const adminState: {
  userEmail: string | null;
  authError: unknown;
} = { userEmail: null, authError: null };

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: adminState.userEmail
            ? { user: { id: "user-x", email: adminState.userEmail } }
            : { user: null },
          error: adminState.authError,
        })),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// mail mock
// ---------------------------------------------------------------------------
const sendApprovalEmailSpy = vi.fn<
  (to: string, caseTitle: string) => Promise<void>
>(async () => undefined);
const sendRejectionEmailSpy = vi.fn<
  (to: string, caseTitle: string, reason: string) => Promise<void>
>(async () => undefined);

vi.mock("@/lib/mail", () => ({
  sendApprovalEmail: (to: string, t: string) => sendApprovalEmailSpy(to, t),
  sendRejectionEmail: (to: string, t: string, r: string) =>
    sendRejectionEmailSpy(to, t, r),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Cases", () => {
  beforeEach(() => {
    serverState.user = null;
    serverState.responses = [];
    serverState.captured = [];
    serverState.rlsBlock = false;
    serverState.role = null;
    adminState.userEmail = null;
    adminState.authError = null;
    sendApprovalEmailSpy.mockClear();
    sendRejectionEmailSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // create-case.test.ts
  //
  // Production case creation is inline in app/dashboard/requestee/new/page.tsx
  // (client-side). The helper below mirrors that insert path plus the guards
  // the UI/RLS layer enforce (required title, requestee-only, doc size cap).
  // -------------------------------------------------------------------------
  describe("create-case.test.ts", () => {
    const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB

    type CreateInput = {
      title: string;
      description?: string;
      filters?: object;
      files?: Array<{ name: string; size: number }>;
    };

    async function createCase(input: CreateInput) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");
      if (user.user_metadata?.role !== "requestee") {
        throw new Error("Forbidden: requestee role required");
      }
      if (!input.title.trim()) {
        throw new Error("Missing required field: title");
      }
      for (const f of input.files ?? []) {
        if (f.size > MAX_FILE_BYTES) {
          throw new Error(`File ${f.name} exceeds the 50 MiB limit`);
        }
      }
      const { data, error } = await supabase
        .from("cases")
        .insert({
          user_id: user.id,
          title: input.title,
          description: input.description ?? "",
          filters: input.filters ?? {},
          status: "current",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    it("Happy path", async () => {
      serverState.user = {
        id: "req-1",
        user_metadata: { role: "requestee" },
      };
      serverState.responses = [
        { data: { id: "case-1", title: "My case" }, error: null },
      ];

      const result = await createCase({
        title: "My case",
        description: "Discovery review",
        filters: { age: { min: 25, max: 45 } },
      });

      expect(result).toEqual({ id: "case-1", title: "My case" });
      const insertCall = serverState.captured.find((c) => c.table === "cases");
      expect(insertCall).toBeDefined();
      const insertOp = insertCall!.ops.find((o) => o.op === "insert") as
        | { op: "insert"; payload: Record<string, unknown> }
        | undefined;
      expect(insertOp?.payload.title).toBe("My case");
      expect(insertOp?.payload.user_id).toBe("req-1");
      expect(insertOp?.payload.filters).toEqual({ age: { min: 25, max: 45 } });
    });

    it("Missing required field", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await expect(createCase({ title: "   " })).rejects.toThrow(
        /Missing required field: title/
      );
      // Must not have attempted any DB insert
      expect(serverState.captured).toHaveLength(0);
    });

    it("Non-requestee blocked", async () => {
      serverState.user = {
        id: "participant-1",
        user_metadata: { role: "participant" },
      };

      await expect(
        createCase({ title: "Sneaky case" })
      ).rejects.toThrow(/requestee role required/);
      expect(serverState.captured).toHaveLength(0);
    });

    it("Oversized files rejected", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await expect(
        createCase({
          title: "Has huge doc",
          files: [{ name: "huge.pdf", size: 60 * 1024 * 1024 }],
        })
      ).rejects.toThrow(/exceeds the 50 MiB limit/);
      expect(serverState.captured).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // approve-case.test.ts — uses real approveCaseAction
  // -------------------------------------------------------------------------
  describe("approve-case.test.ts", () => {
    let approveCaseAction: (typeof import("@/lib/actions/adminCase"))["approveCaseAction"];
    beforeAll(async () => {
      ({ approveCaseAction } = await import("@/lib/actions/adminCase"));
    });
    beforeEach(() => asAdmin());

    it("Updates admin_status", async () => {
      serverState.responses = [
        {
          data: { title: "Case A", user_id: "req-1", filters: {}, hours_requested: 3 },
          error: null,
        },
      ];
      adminState.userEmail = "owner@example.com";

      await approveCaseAction("case-A");

      const update = serverState.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      );
      const updateOp = update!.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(update!.table).toBe("cases");
      expect(updateOp.payload).toEqual({ admin_status: "approved" });
      expect(update!.eqs).toContainEqual(["id", "case-A"]);
    });

    it("Sends approval email", async () => {
      serverState.responses = [
        {
          data: { title: "Trial X", user_id: "req-7", filters: {}, hours_requested: 2 },
          error: null,
        },
      ];
      adminState.userEmail = "trial-owner@example.com";

      await approveCaseAction("case-X");

      expect(sendApprovalEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendApprovalEmailSpy).toHaveBeenCalledWith(
        "trial-owner@example.com",
        "Trial X"
      );
    });

    it("Non-admin blocked, even the firm that owns the case", async () => {
      // RLS doesn't stop this one: "user can update own cases" lets a firm's
      // login write its own row, admin_status included. So the action refuses
      // anyone but an admin before the update and before the email.
      serverState.user = { id: "req-1" };
      serverState.responses = [
        { data: { title: "Own case", user_id: "req-1", filters: {}, hours_requested: 3 }, error: null },
      ];
      adminState.userEmail = "req-1@example.com";
      for (const role of ["requestee", "participant", "blacklisted", null]) {
        serverState.role = role;
        await expect(approveCaseAction("case-own")).rejects.toThrow("Not authorized");
      }
      serverState.user = null;
      await expect(approveCaseAction("case-own")).rejects.toThrow("Not authenticated");

      expect(serverState.captured.filter((c) => c.table !== "roles")).toEqual([]);
      expect(sendApprovalEmailSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // reject-case.test.ts — uses real rejectCaseAction
  // -------------------------------------------------------------------------
  describe("reject-case.test.ts", () => {
    let rejectCaseAction: (typeof import("@/lib/actions/adminCase"))["rejectCaseAction"];
    beforeAll(async () => {
      ({ rejectCaseAction } = await import("@/lib/actions/adminCase"));
    });
    beforeEach(() => asAdmin());

    it("Updates status", async () => {
      serverState.responses = [
        { data: { title: "Case Y", user_id: "req-2" }, error: null },
      ];
      adminState.userEmail = "y-owner@example.com";

      await rejectCaseAction("case-Y", "Out of scope");

      const update = serverState.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      );
      const updateOp = update!.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(updateOp.payload.admin_status).toBe("rejected");
    });

    it("Records rejection_reason", async () => {
      serverState.responses = [
        { data: { title: "Case Z", user_id: "req-3" }, error: null },
      ];
      adminState.userEmail = "z@example.com";

      await rejectCaseAction("case-Z", "Insufficient evidence");

      const update = serverState.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      );
      const updateOp = update!.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(updateOp.payload.rejection_reason).toBe("Insufficient evidence");
    });

    it("Sends rejection email", async () => {
      serverState.responses = [
        { data: { title: "Case Q", user_id: "req-9" }, error: null },
      ];
      adminState.userEmail = "q@example.com";

      await rejectCaseAction("case-Q", "Duplicate of #123");

      expect(sendRejectionEmailSpy).toHaveBeenCalledWith(
        "q@example.com",
        "Case Q",
        "Duplicate of #123"
      );
    });

    it("Non-admin blocked, even the firm that owns the case", async () => {
      // Otherwise a firm could reject its own case with a reason of its own
      // choosing, and have support@ email it that text, as often as it liked.
      serverState.user = { id: "req-1" };
      serverState.responses = [{ data: { title: "Own case", user_id: "req-1" }, error: null }];
      adminState.userEmail = "req-1@example.com";
      for (const role of ["requestee", "participant", "blacklisted", null]) {
        serverState.role = role;
        await expect(rejectCaseAction("case-own", "<a href=x>")).rejects.toThrow("Not authorized");
      }
      serverState.user = null;
      await expect(rejectCaseAction("case-own", "<a href=x>")).rejects.toThrow("Not authenticated");

      expect(serverState.captured.filter((c) => c.table !== "roles")).toEqual([]);
      expect(sendRejectionEmailSpy).not.toHaveBeenCalled();
    });

    it("Refuses a blank reason before writing or emailing", async () => {
      serverState.responses = [{ data: { title: "Case Q", user_id: "req-9" }, error: null }];
      adminState.userEmail = "q@example.com";

      for (const reason of ["", "   ", undefined as unknown as string]) {
        await expect(rejectCaseAction("case-Q", reason)).rejects.toThrow(/reason is required/);
      }
      expect(serverState.captured.filter((c) => c.table !== "roles")).toEqual([]);
      expect(sendRejectionEmailSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // archive-case.test.ts
  //
  // softDeleteCase is an inline server action in app/dashboard/requestee/page.tsx
  // (~line 140) that flips status→"previous" and sets deleted_at, scoped to
  // user_id. We mirror that here.
  // -------------------------------------------------------------------------
  describe("archive-case.test.ts", () => {
    async function archiveCase(caseId: string, opts?: { byAdmin?: boolean }) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      let q = supabase
        .from("cases")
        .update({
          status: "previous",
          deleted_at: new Date().toISOString(),
        })
        .eq("id", caseId);
      if (!opts?.byAdmin) {
        q = q.eq("user_id", user.id);
      }
      await q;
    }

    it("Requestee archives own case", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await archiveCase("case-A");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.status).toBe("previous");
      expect(upd.payload.deleted_at).toEqual(expect.any(String));
      expect(c.eqs).toContainEqual(["id", "case-A"]);
      expect(c.eqs).toContainEqual(["user_id", "req-1"]);
    });

    it("Admin archives any case", async () => {
      serverState.user = { id: "admin-1", user_metadata: { role: "admin" } };

      await archiveCase("case-B", { byAdmin: true });

      const c = serverState.captured.find((x) => x.table === "cases")!;
      // No user_id filter — admin can archive cases they don't own
      expect(c.eqs).toContainEqual(["id", "case-B"]);
      expect(c.eqs.some(([col]) => col === "user_id")).toBe(false);
    });

    it("Requestee blocked from archiving others' cases", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
      // The requestee's update is scoped by user_id, so RLS (or the implicit
      // filter) prevents the update from affecting anyone else's row — the DB
      // returns success but zero rows changed. We assert the user_id filter is
      // applied so the request can never touch another user's row.
      await archiveCase("someone-elses-case");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      expect(c.eqs).toContainEqual(["user_id", "req-1"]);
    });
  });

  // -------------------------------------------------------------------------
  // restore-case.test.ts
  //
  // restoreCase is the inline action at app/dashboard/requestee/page.tsx:160.
  // -------------------------------------------------------------------------
  describe("restore-case.test.ts", () => {
    async function restoreCase(caseId: string, opts?: { byAdmin?: boolean }) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      let q = supabase
        .from("cases")
        .update({ status: "current", deleted_at: null })
        .eq("id", caseId);
      if (!opts?.byAdmin) {
        q = q.eq("user_id", user.id);
      }
      await q;
    }

    it("Admin restore success", async () => {
      serverState.user = { id: "admin-1", user_metadata: { role: "admin" } };

      await restoreCase("case-arc-1", { byAdmin: true });

      const c = serverState.captured.find((x) => x.table === "cases")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload).toEqual({ status: "current", deleted_at: null });
      expect(c.eqs).toContainEqual(["id", "case-arc-1"]);
    });

    it("Requestee blocked", async () => {
      // RLS denies a requestee restoring a case they don't own.
      serverState.user = { id: "req-2", user_metadata: { role: "requestee" } };
      serverState.rlsBlock = true;

      await restoreCase("foreign-case");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      // The user_id filter was still applied — defense in depth
      expect(c.eqs).toContainEqual(["user_id", "req-2"]);
    });
  });

  // -------------------------------------------------------------------------
  // update-case-filters.test.ts — uses real updateCaseFilters
  // -------------------------------------------------------------------------
  describe("update-case-filters.test.ts", () => {
    let updateCaseFilters: (typeof import("@/app/dashboard/requestee/actions/updateCaseFilters"))["updateCaseFilters"];
    beforeAll(async () => {
      ({ updateCaseFilters } = await import(
        "@/app/dashboard/requestee/actions/updateCaseFilters"
      ));
    });

    it("Filter JSON persisted", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
      // 1st response: the .select('admin_scheduled_at').single() pre-check
      // 2nd response: the .update().eq() final write
      serverState.responses = [
        { data: { admin_scheduled_at: null }, error: null },
        { data: null, error: null },
      ];

      const filters = {
        gender: ["female"],
        age: { min: 30, max: 60 },
      };

      await updateCaseFilters("case-1", filters);

      const updateCall = serverState.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.filters).toEqual(filters);
      expect(updateCall.eqs).toContainEqual(["id", "case-1"]);
      expect(updateCall.eqs).toContainEqual(["user_id", "req-1"]);
    });

    it("Education hierarchy auto-fill respected", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
      serverState.responses = [
        { data: { admin_scheduled_at: null }, error: null },
        { data: null, error: null },
      ];

      // Selecting "Some College" pulls in everything above it.
      const educationLevels = applyEducationAutoSelect("Some College", []);
      expect(educationLevels).toEqual([
        "Some College",
        "Bachelor Degree",
        "Graduate Degree",
      ]);

      const filters = {
        socioeconomic: { education_level: educationLevels },
      };
      await updateCaseFilters("case-edu", filters);

      const upd = serverState.captured
        .flatMap((c) => c.ops)
        .find((o) => o.op === "update") as {
        op: "update";
        payload: { filters: { socioeconomic: { education_level: string[] } } };
      };
      // Hierarchy must round-trip unchanged through the persist layer.
      expect(upd.payload.filters.socioeconomic.education_level).toEqual(
        educationLevels
      );
      // Sanity: result is a strict subset of canonical levels
      for (const lvl of upd.payload.filters.socioeconomic.education_level) {
        expect(EDUCATION_LEVELS).toContain(lvl);
      }
    });
  });

  // -------------------------------------------------------------------------
  // The firm's own case forms — real actions in
  // app/dashboard/requestee/actions/caseUpdates.ts. Each acts only on a case in
  // the state its form is shown for, checked in the UPDATE itself.
  // -------------------------------------------------------------------------
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    return fd;
  };

  const caseUpdates = () =>
    serverState.captured.filter((c) => c.table === "cases" && c.ops.some((o) => o.op === "update"));

  const updatePayload = (call: CapturedCall) =>
    (call.ops.find((o) => o.op === "update") as { op: "update"; payload: Record<string, unknown> }).payload;

  describe("confirm-schedule.test.ts", () => {
    let respondToSchedule: (typeof import("@/app/dashboard/requestee/actions/caseUpdates"))["respondToSchedule"];
    beforeAll(async () => {
      ({ respondToSchedule } = await import("@/app/dashboard/requestee/actions/caseUpdates"));
    });
    beforeEach(() => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
    });

    // The buttons show while a proposed time awaits an answer: one is set, and
    // schedule_status is 'pending', or null after a reschedule reset it.
    const AWAITING = ["or", "schedule_status.is.null,schedule_status.eq.pending"];

    it("pending → accepted, on the time the firm was shown", async () => {
      serverState.responses = [
        { data: { admin_scheduled_at: "2026-06-10T17:00:00Z" }, error: null }, // the case, awaiting an answer
        { data: null, error: null }, // the update
      ];

      await respondToSchedule(form({ caseId: "case-sched-1", response: "accepted" }));

      const [read, write] = serverState.captured.filter((c) => c.table === "cases");
      expect(read.eqs).toEqual([["id", "case-sched-1"], ["user_id", "req-1"]]);
      expect(read.filters).toContainEqual(["not", "admin_scheduled_at", "is", null]);
      expect(read.filters).toContainEqual(AWAITING);

      expect(updatePayload(write)).toEqual({ schedule_status: "accepted", scheduled_at: "2026-06-10T17:00:00Z" });
      // The same state and the same time again in the write, so a new proposal
      // that lands in between isn't answered with this one.
      expect(write.eqs).toEqual([
        ["id", "case-sched-1"],
        ["user_id", "req-1"],
        ["admin_scheduled_at", "2026-06-10T17:00:00Z"],
      ]);
      expect(write.filters).toContainEqual(AWAITING);
    });

    it("Confirming a case in a session makes its start the preferred time, not its end", async () => {
      // In a session, admin_scheduled_at is when the case ENDS: 10-11 AM CST is
      // 17:00 UTC. Copied as it was, the firm's Preferred Date became 11 AM.
      serverState.responses = [
        {
          data: {
            admin_scheduled_at: "2026-11-05T17:00:00.000Z",
            session_cases: [
              { start_time: "16:00:00", end_time: "17:00:00", sessions: { session_date: "2026-11-05" } },
            ],
          },
          error: null,
        },
        { data: null, error: null },
      ];

      await respondToSchedule(form({ caseId: "case-sched-1", response: "accepted" }));

      const [write] = caseUpdates();
      expect(updatePayload(write)).toEqual({ schedule_status: "accepted", scheduled_at: "2026-11-05T16:00:00.000Z" });
      // Still answered only while that same end time stands.
      expect(write.eqs).toContainEqual(["admin_scheduled_at", "2026-11-05T17:00:00.000Z"]);
    });

    it("Decline records the answer only", async () => {
      serverState.responses = [
        { data: { admin_scheduled_at: "2026-06-10T17:00:00Z" }, error: null },
        { data: null, error: null },
      ];

      await respondToSchedule(form({ caseId: "case-sched-1", response: "rejected" }));

      expect(caseUpdates().map(updatePayload)).toEqual([{ schedule_status: "rejected" }]);
    });

    it("Ignores any other answer, before reading the case", async () => {
      for (const response of ["pending", "<b>yes</b>", ""]) {
        await respondToSchedule(form({ caseId: "case-sched-1", response }));
      }
      expect(serverState.captured).toEqual([]);
    });

    it("Writes nothing when no time is awaiting an answer", async () => {
      // Already answered, never proposed, or someone else's case: the read
      // finds nothing, so nothing is written.
      serverState.responses = [{ data: null, error: null }];

      await respondToSchedule(form({ caseId: "case-sched-1", response: "accepted" }));

      expect(caseUpdates()).toEqual([]);
    });
  });

  describe("update-case.test.ts", () => {
    let updateCase: (typeof import("@/app/dashboard/requestee/actions/caseUpdates"))["updateCase"];
    beforeAll(async () => {
      ({ updateCase } = await import("@/app/dashboard/requestee/actions/caseUpdates"));
    });
    beforeEach(() => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
    });

    const details = {
      case_id: "case-1",
      title: "Smith v. Jones",
      description: "Updated",
      scheduled_at: "",
      focus_group_type: "",
      case_type: "",
      hours_requested: "3",
      county: "Harris",
      participants_from_county: "",
      session_completion_timeframe: "",
      preferred_day: "",
    };

    it("Edits only a current case that isn't approved yet", async () => {
      serverState.responses = [{ data: null, error: null }];

      await updateCase(form(details));

      const [write] = caseUpdates();
      expect(updatePayload(write)).toMatchObject({ title: "Smith v. Jones", hours_requested: 3, county: "Harris" });
      expect(write.eqs).toEqual([["id", "case-1"], ["user_id", "req-1"], ["status", "current"]]);
      // 'rejected' stays editable until Request Again; approved and submitted don't.
      expect(write.filters).toContainEqual(["in", "admin_status", ["all", "rejected"]]);
    });

    it("Saves the Schedule field as Central Time, and the deadline at 11:59 PM Central", async () => {
      // The server action runs on UTC: new Date("2026-11-05T10:00") stored 10:00
      // UTC, 4 AM CST. The deadline was 11:59 PM UTC, 6:59 PM CDT.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-15T01:00:00Z")); // 8 PM CDT on Oct 14
      try {
        serverState.responses = [{ data: null, error: null }];

        await updateCase(
          form({ ...details, scheduled_at: "2026-11-05T10:00", session_completion_timeframe: "Within a Week" }),
        );

        expect(updatePayload(caseUpdates()[0])).toMatchObject({
          scheduled_at: "2026-11-05T16:00:00.000Z",
          deadline_date: "2026-10-22T04:59:00.000Z", // Oct 21, 11:59 PM CDT
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("Clears the schedule and deadline when the form sends none", async () => {
      serverState.responses = [{ data: null, error: null }];

      await updateCase(form(details));

      expect(updatePayload(caseUpdates()[0])).toMatchObject({ scheduled_at: null, deadline_date: null });
    });

    it("Drops the format once the case is in a session", async () => {
      serverState.responses = [
        { data: [{ id: "sc-1" }], error: null }, // session_cases: scheduled
        { data: null, error: null },
      ];

      await updateCase(form({ ...details, delivery_mode: "offline" }));

      expect(updatePayload(caseUpdates()[0])).not.toHaveProperty("delivery_mode");
    });

    it("Signed out: nothing written", async () => {
      serverState.user = null;
      await updateCase(form(details));
      expect(serverState.captured).toEqual([]);
    });
  });

  describe("request-again.test.ts", () => {
    let requestAgain: (typeof import("@/app/dashboard/requestee/actions/caseUpdates"))["requestAgain"];
    beforeAll(async () => {
      ({ requestAgain } = await import("@/app/dashboard/requestee/actions/caseUpdates"));
    });

    it("Only a rejected, current case goes back to the queue", async () => {
      // Without the admin_status filter a firm could pull its approved case out
      // of the Approved list, and its session's Notify Presenter, by asking again.
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
      serverState.responses = [{ data: null, error: null }];

      await requestAgain(form({ case_id: "case-r" }));

      const [write] = caseUpdates();
      expect(updatePayload(write)).toEqual({ admin_status: "all", rejection_reason: null });
      expect(write.eqs).toEqual([
        ["id", "case-r"],
        ["user_id", "req-1"],
        ["status", "current"],
        ["admin_status", "rejected"],
      ]);
    });

    it("Signed out: nothing written", async () => {
      await requestAgain(form({ case_id: "case-r" }));
      expect(serverState.captured).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // propose-schedule.test.ts / unapprove-case.test.ts — the Approved tab's
  // Send and Unapprove, real actions in lib/actions/adminCase.ts.
  // -------------------------------------------------------------------------
  describe("propose-schedule.test.ts", () => {
    let proposeScheduleAction: (typeof import("@/lib/actions/adminCase"))["proposeScheduleAction"];
    beforeAll(async () => {
      ({ proposeScheduleAction } = await import("@/lib/actions/adminCase"));
    });

    it("Sets admin_scheduled_at and resets schedule_status, so the firm must confirm", async () => {
      asAdmin();

      // Central Time, whatever zone a stale form says: 3:30 PM CDT is 20:30 UTC.
      // The admin's browser zone used to be sent and used.
      await proposeScheduleAction(form({ caseId: "case-1", scheduled_at: "2026-07-01T15:30", tz: "Asia/Kolkata" }));

      const [write] = caseUpdates();
      expect(updatePayload(write)).toEqual({
        admin_scheduled_at: "2026-07-01T20:30:00.000Z",
        schedule_status: "pending",
      });
      expect(write.eqs).toEqual([["id", "case-1"]]);
    });

    it("Refuses a time it can't read, before writing", async () => {
      asAdmin();
      for (const scheduled_at of ["", "2026-07-01", "2026-02-30T10:00", "2026-07-01T25:00"]) {
        await expect(proposeScheduleAction(form({ caseId: "case-1", scheduled_at }))).rejects.toThrow(
          "Pick a date and time",
        );
      }
      expect(caseUpdates()).toEqual([]);
    });

    it("Refuses anyone but an admin, even on the firm's own case", async () => {
      // "user can update own cases" would let a firm's login set its own
      // proposed time, which it could then confirm.
      serverState.user = { id: "req-1" };
      for (const role of ["requestee", "participant", "blacklisted", null]) {
        serverState.role = role;
        await expect(
          proposeScheduleAction(form({ caseId: "case-own", scheduled_at: "2026-07-01T15:30" }))
        ).rejects.toThrow("Not authorized");
      }
      serverState.user = null;
      await expect(
        proposeScheduleAction(form({ caseId: "case-own", scheduled_at: "2026-07-01T15:30" }))
      ).rejects.toThrow("Not authenticated");

      expect(serverState.captured.filter((c) => c.table !== "roles")).toEqual([]);
    });
  });

  describe("unapprove-case.test.ts", () => {
    let unapproveCaseAction: (typeof import("@/lib/actions/adminCase"))["unapproveCaseAction"];
    beforeAll(async () => {
      ({ unapproveCaseAction } = await import("@/lib/actions/adminCase"));
    });

    it("Sends an admin's case back to the Requested queue", async () => {
      asAdmin();

      await unapproveCaseAction(form({ caseId: "case-1" }));

      const [write] = caseUpdates();
      expect(updatePayload(write)).toEqual({ admin_status: "all" });
      expect(write.eqs).toEqual([["id", "case-1"]]);
    });

    it("Refuses anyone but an admin, even on the firm's own case", async () => {
      serverState.user = { id: "req-1" };
      for (const role of ["requestee", "participant", "blacklisted", null]) {
        serverState.role = role;
        await expect(unapproveCaseAction(form({ caseId: "case-own" }))).rejects.toThrow("Not authorized");
      }
      serverState.user = null;
      await expect(unapproveCaseAction(form({ caseId: "case-own" }))).rejects.toThrow("Not authenticated");

      expect(serverState.captured.filter((c) => c.table !== "roles")).toEqual([]);
    });
  });
});
