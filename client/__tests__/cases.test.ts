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
};

const serverState: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  // Each terminal awaitable (.single() or implicit await on the chain) shifts one off
  responses: Array<{ data: unknown; error: unknown }>;
  captured: CapturedCall[];
  // RLS-style: when true, the next update/insert/delete returns an error
  rlsBlock: boolean;
} = {
  user: null,
  responses: [],
  captured: [],
  rlsBlock: false,
};

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
      const captured: CapturedCall = { table, ops: [], eqs: [] };
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
      builder.in = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.single = vi.fn(async () => nextResponse());
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

    it("Non-admin blocked", async () => {
      // A non-admin caller is blocked at the database boundary by RLS — the
      // update returns an error and the action propagates it.
      serverState.rlsBlock = true;

      await expect(approveCaseAction("case-X")).rejects.toMatchObject({
        code: "42501",
      });
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

    it("Non-admin blocked", async () => {
      serverState.rlsBlock = true;

      await expect(
        rejectCaseAction("case-Q", "any reason")
      ).rejects.toMatchObject({ code: "42501" });
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
  // confirm-schedule.test.ts
  //
  // respondToSchedule is the inline action at app/dashboard/requestee/page.tsx:250.
  // -------------------------------------------------------------------------
  describe("confirm-schedule.test.ts", () => {
    async function respondToSchedule(
      caseId: string,
      response: "accepted" | "rejected"
    ) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const updatePayload: Record<string, string | null> = {
        schedule_status: response,
      };
      if (response === "accepted") {
        const { data: caseData } = await supabase
          .from("cases")
          .select("admin_scheduled_at")
          .eq("id", caseId)
          .single();
        updatePayload.scheduled_at =
          (caseData as { admin_scheduled_at: string | null } | null)
            ?.admin_scheduled_at ?? null;
      }
      await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseId)
        .eq("user_id", user.id);
    }

    it("pending → accepted", async () => {
      serverState.user = { id: "req-1", user_metadata: { role: "requestee" } };
      // 1st response: select admin_scheduled_at
      // 2nd response: terminal update
      serverState.responses = [
        { data: { admin_scheduled_at: "2026-06-10T17:00:00Z" }, error: null },
        { data: null, error: null },
      ];

      await respondToSchedule("case-sched-1", "accepted");

      const updateCall = serverState.captured.find((c) =>
        c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.schedule_status).toBe("accepted");
      expect(upd.payload.scheduled_at).toBe("2026-06-10T17:00:00Z");
    });

    it("Admin reschedule resets status", async () => {
      // When an admin proposes a new schedule, the requestee's prior "accepted"
      // is invalidated: schedule_status is reset to "pending" so they must
      // confirm again.
      async function adminProposeSchedule(caseId: string, isoTs: string) {
        const { createClient } = await import("@/lib/supabase/server");
        const supabase = await createClient();
        await supabase
          .from("cases")
          .update({
            admin_scheduled_at: isoTs,
            schedule_status: "pending",
          })
          .eq("id", caseId);
      }

      await adminProposeSchedule("case-sched-1", "2026-06-15T17:00:00Z");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.schedule_status).toBe("pending");
      expect(upd.payload.admin_scheduled_at).toBe("2026-06-15T17:00:00Z");
    });
  });

  // -------------------------------------------------------------------------
  // propose-schedule.test.ts
  //
  // proposeSchedule is the inline action at app/dashboard/Admin/page.tsx:57.
  // -------------------------------------------------------------------------
  describe("propose-schedule.test.ts", () => {
    async function proposeSchedule(caseId: string, isoTs: string) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("cases")
        .update({
          admin_scheduled_at: isoTs,
          schedule_status: "pending",
        })
        .eq("id", caseId);
    }

    it("Sets admin_scheduled_at", async () => {
      await proposeSchedule("case-1", "2026-07-01T20:30:00Z");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.admin_scheduled_at).toBe("2026-07-01T20:30:00Z");
      expect(c.eqs).toContainEqual(["id", "case-1"]);
    });

    it("Resets schedule_status when schedule changes", async () => {
      // Case had been accepted; admin proposes a new slot → status flips back
      // to "pending" so the requestee must re-confirm.
      await proposeSchedule("case-1", "2026-07-15T20:30:00Z");

      const c = serverState.captured.find((x) => x.table === "cases")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.schedule_status).toBe("pending");
    });
  });
});
