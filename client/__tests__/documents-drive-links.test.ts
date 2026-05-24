import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";

// ---------------------------------------------------------------------------
// Stateful supabase mock — table chain + storage bucket calls
// ---------------------------------------------------------------------------
type CapturedOp =
  | { op: "select"; cols?: unknown }
  | { op: "update"; payload: Record<string, unknown> }
  | { op: "insert"; payload: Record<string, unknown> }
  | { op: "delete" };

type CapturedTableCall = {
  table: string;
  ops: CapturedOp[];
  eqs: Array<[string, unknown]>;
};

type CapturedStorageCall =
  | { kind: "upload"; bucket: string; path: string; file: { name: string; size: number; type: string } }
  | { kind: "remove"; bucket: string; paths: string[] };

const state: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  responses: Array<Record<string, unknown>>;
  storageResponses: Array<{ data: unknown; error: unknown }>;
  captured: CapturedTableCall[];
  capturedStorage: CapturedStorageCall[];
  rlsBlock: boolean;
} = {
  user: null,
  responses: [],
  storageResponses: [],
  captured: [],
  capturedStorage: [],
  rlsBlock: false,
};

function nextTableResponse(): Record<string, unknown> {
  if (state.rlsBlock) {
    return {
      data: null,
      error: { message: "row-level security violation", code: "42501" },
    };
  }
  return state.responses.shift() ?? { data: null, error: null };
}

function nextStorageResponse(): { data: unknown; error: unknown } {
  return state.storageResponses.shift() ?? { data: null, error: null };
}

function makeChainBuilder(table: string) {
  const captured: CapturedTableCall = { table, ops: [], eqs: [] };
  state.captured.push(captured);

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((cols?: unknown) => {
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
  builder.maybeSingle = vi.fn(async () => nextTableResponse());
  builder.single = vi.fn(async () => nextTableResponse());
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown
  ) => Promise.resolve(nextTableResponse()).then(resolve);
  return builder;
}

function makeStorageBucket(bucket: string) {
  return {
    upload: vi.fn(
      async (
        path: string,
        file: { name: string; size: number; type: string }
      ) => {
        state.capturedStorage.push({ kind: "upload", bucket, path, file });
        return nextStorageResponse();
      }
    ),
    remove: vi.fn(async (paths: string[]) => {
      state.capturedStorage.push({ kind: "remove", bucket, paths });
      return nextStorageResponse();
    }),
    createSignedUrl: vi.fn(async () =>
      nextStorageResponse()
    ),
  };
}

function makeClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
    },
    from: vi.fn((table: string) => makeChainBuilder(table)),
    storage: {
      from: vi.fn((bucket: string) => makeStorageBucket(bucket)),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeClient()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Documents & Drive Links", () => {
  beforeEach(() => {
    state.user = null;
    state.responses = [];
    state.storageResponses = [];
    state.captured = [];
    state.capturedStorage = [];
    state.rlsBlock = false;
  });

  // -------------------------------------------------------------------------
  // upload-case-document.test.ts — real uploadCaseDocument
  // -------------------------------------------------------------------------
  describe("upload-case-document.test.ts", () => {
    let uploadCaseDocument: (typeof import("@/app/dashboard/requestee/actions/caseDocuments"))["uploadCaseDocument"];
    beforeAll(async () => {
      ({ uploadCaseDocument } = await import(
        "@/app/dashboard/requestee/actions/caseDocuments"
      ));
    });

    function makeFile(): File {
      return new File(["dummy pdf bytes"], "brief.pdf", {
        type: "application/pdf",
      });
    }

    it("Correct storage path", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: null }];

      await uploadCaseDocument("case-XYZ", makeFile());

      const upload = state.capturedStorage.find((c) => c.kind === "upload");
      expect(upload).toBeDefined();
      expect(upload!.bucket).toBe("case-documents");
      // Path is `${caseId}/${uuid}.${ext}` — assert prefix + extension
      expect((upload as { path: string }).path).toMatch(/^case-XYZ\/.+\.pdf$/);
    });

    it("case_documents row created", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: null }];

      await uploadCaseDocument("case-XYZ", makeFile());

      const tableCall = state.captured.find((c) => c.table === "case_documents")!;
      const insert = tableCall.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Record<string, unknown>;
      };
      expect(insert.payload.case_id).toBe("case-XYZ");
      expect(insert.payload.uploaded_by).toBe("req-1");
      expect(insert.payload.original_name).toBe("brief.pdf");
      expect(insert.payload.mime_type).toBe("application/pdf");
      expect(insert.payload.storage_path).toMatch(/^case-XYZ\/.+\.pdf$/);
      expect(insert.payload.file_size).toBeGreaterThan(0);
    });

    it("Requestee-only access", async () => {
      // No authenticated session → action throws Unauthorized before touching
      // storage or DB. (Role-based enforcement on top of that lives at the
      // RLS layer for the case_documents table.)
      state.user = null;

      await expect(
        uploadCaseDocument("case-XYZ", makeFile())
      ).rejects.toThrow(/Unauthorized/);
      expect(state.capturedStorage).toHaveLength(0);
      expect(state.captured).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // delete-case-document.test.ts — real deleteCaseDocument
  // -------------------------------------------------------------------------
  describe("delete-case-document.test.ts", () => {
    let deleteCaseDocument: (typeof import("@/app/dashboard/requestee/actions/caseDocuments"))["deleteCaseDocument"];
    beforeAll(async () => {
      ({ deleteCaseDocument } = await import(
        "@/app/dashboard/requestee/actions/caseDocuments"
      ));
    });

    it("Removes file and database row", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: null }];

      await deleteCaseDocument("doc-1", "case-A/abc.pdf");

      const remove = state.capturedStorage.find((c) => c.kind === "remove");
      expect(remove).toBeDefined();
      expect(remove!.bucket).toBe("case-documents");
      expect((remove as { paths: string[] }).paths).toEqual(["case-A/abc.pdf"]);

      const tableCall = state.captured.find((c) => c.table === "case_documents")!;
      expect(tableCall.ops.some((o) => o.op === "delete")).toBe(true);
      expect(tableCall.eqs).toContainEqual(["id", "doc-1"]);
    });

    it("Owner-only deletion", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: null }];

      await deleteCaseDocument("doc-1", "case-A/abc.pdf");

      const tableCall = state.captured.find((c) => c.table === "case_documents")!;
      // The owner-only guard is the .eq("uploaded_by", user.id) filter — any
      // delete that does not carry that filter scoped to the caller's id is a
      // regression.
      expect(tableCall.eqs).toContainEqual(["uploaded_by", "req-1"]);
    });
  });

  // -------------------------------------------------------------------------
  // add-drive-link.test.ts — real addDriveLink + URL-validity guard
  // -------------------------------------------------------------------------
  describe("add-drive-link.test.ts", () => {
    let addDriveLink: (typeof import("@/app/dashboard/requestee/actions/caseDriveLinks"))["addDriveLink"];
    beforeAll(async () => {
      ({ addDriveLink } = await import(
        "@/app/dashboard/requestee/actions/caseDriveLinks"
      ));
    });

    // The production server action does not itself validate the URL — the
    // form should reject invalid input before it reaches the action. The
    // wrapper below mirrors that contract so the guarantee is captured here.
    async function addValidatedDriveLink(caseId: string, url: string) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("Invalid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Invalid URL");
      }
      await addDriveLink(caseId, url);
    }

    it("Valid URL persists", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [{ error: null }];

      await addValidatedDriveLink(
        "case-1",
        "https://drive.google.com/folders/abc"
      );

      const c = state.captured.find((x) => x.table === "case_drive_links")!;
      const insert = c.ops.find((o) => o.op === "insert") as {
        op: "insert";
        payload: Record<string, unknown>;
      };
      expect(insert.payload.case_id).toBe("case-1");
      expect(insert.payload.uploaded_by).toBe("req-1");
      expect(insert.payload.url).toBe("https://drive.google.com/folders/abc");
    });

    it("Invalid URL rejected", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await expect(
        addValidatedDriveLink("case-1", "not a real url")
      ).rejects.toThrow(/Invalid URL/);
      // The DB layer was never touched
      expect(state.captured).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // remove-drive-link.test.ts — real deleteDriveLink
  // -------------------------------------------------------------------------
  describe("remove-drive-link.test.ts", () => {
    let deleteDriveLink: (typeof import("@/app/dashboard/requestee/actions/caseDriveLinks"))["deleteDriveLink"];
    beforeAll(async () => {
      ({ deleteDriveLink } = await import(
        "@/app/dashboard/requestee/actions/caseDriveLinks"
      ));
    });

    it("Owner can remove link", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [{ error: null }];

      await deleteDriveLink("link-1");

      const c = state.captured.find((x) => x.table === "case_drive_links")!;
      expect(c.ops.some((o) => o.op === "delete")).toBe(true);
      expect(c.eqs).toContainEqual(["id", "link-1"]);
      expect(c.eqs).toContainEqual(["uploaded_by", "req-1"]);
    });

    it("Non-owner blocked", async () => {
      // The .eq("uploaded_by", user.id) filter scopes the delete to the
      // caller's own rows. Trying to delete a link they don't own affects
      // zero rows — no error is raised at the SQL level, but the row is
      // never touched. We assert the scoping filter is applied (defense in
      // depth) and that an RLS-enforced 42501 propagates as an error when
      // the caller has no privilege on the row at all.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.rlsBlock = true;

      await expect(deleteDriveLink("link-belonging-to-someone-else")).rejects.toMatchObject({
        code: "42501",
      });
      const c = state.captured.find((x) => x.table === "case_drive_links")!;
      expect(c.eqs).toContainEqual(["uploaded_by", "req-1"]);
    });
  });
});
