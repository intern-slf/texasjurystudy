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
  | { kind: "remove"; bucket: string; paths: string[] }
  | { kind: "sign"; bucket: string; path: string };

type CaseRow = { id: string; user_id: string; requestee_id: string | null };

const state: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  responses: Array<Record<string, unknown>>;
  storageResponses: Array<{ data: unknown; error: unknown }>;
  captured: CapturedTableCall[];
  capturedStorage: CapturedStorageCall[];
  rlsBlock: boolean;
  // The cases the service role sees, for the ownership check (ownsAllCases in
  // lib/participant/requesteeAccess), and every table it read.
  cases: CaseRow[];
  adminReads: string[];
} = {
  user: null,
  responses: [],
  storageResponses: [],
  captured: [],
  capturedStorage: [],
  rlsBlock: false,
  cases: [],
  adminReads: [],
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
    createSignedUrl: vi.fn(async (path: string) => {
      state.capturedStorage.push({ kind: "sign", bucket, path });
      return nextStorageResponse();
    }),
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

// ownsAllCases reads cases with the service role: select(...).in("id", ids).
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      state.adminReads.push(table);
      return {
        select: vi.fn(() => ({
          in: vi.fn(async (_col: string, ids: string[]) => ({
            data: table === "cases" ? state.cases.filter((c) => ids.includes(c.id)) : [],
            error: null,
          })),
        })),
      };
    }),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// req-1 created case-A and case-XYZ and is the assigned requestee on case-assigned;
// req-2 owns case-other.
const CASES: CaseRow[] = [
  { id: "case-A", user_id: "req-1", requestee_id: null },
  { id: "case-XYZ", user_id: "req-1", requestee_id: null },
  { id: "case-1", user_id: "req-1", requestee_id: null },
  { id: "case-assigned", user_id: "admin-1", requestee_id: "req-1" },
  { id: "case-other", user_id: "req-2", requestee_id: null },
];

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
    state.cases = CASES.map((c) => ({ ...c }));
    state.adminReads = [];
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

      await uploadCaseDocument("case-XYZ", makeFile(), true);

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

      await uploadCaseDocument("case-XYZ", makeFile(), true);

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
      expect(insert.payload.name_attested).toBe(true);
      expect(typeof insert.payload.name_attested_at).toBe("string");
      expect(
        Number.isNaN(Date.parse(insert.payload.name_attested_at as string)),
      ).toBe(false);
    });

    it("Requestee-only access", async () => {
      // No authenticated session → action throws Unauthorized before touching
      // storage or DB. (Role-based enforcement on top of that lives at the
      // RLS layer for the case_documents table.)
      state.user = null;

      await expect(
        uploadCaseDocument("case-XYZ", makeFile(), true)
      ).rejects.toThrow(/Unauthorized/);
      expect(state.capturedStorage).toHaveLength(0);
      expect(state.captured).toHaveLength(0);
    });

    it("File-name attestation required", async () => {
      // HIPAA: an authenticated requestee who has not attested that they
      // renamed the file is rejected before any storage or DB write.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await expect(
        uploadCaseDocument("case-XYZ", makeFile(), false)
      ).rejects.toThrow(/attestation/i);
      expect(state.capturedStorage).toHaveLength(0);
      expect(state.captured).toHaveLength(0);
    });

    it("Refuses another firm's case before uploading anything", async () => {
      // Neither the case_documents INSERT policy nor the storage policy looks at
      // the case, so this check is all that stops a file landing on someone
      // else's case, where the presenter email would link it.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };

      for (const caseId of ["case-other", "no-such-case"]) {
        await expect(uploadCaseDocument(caseId, makeFile(), true)).rejects.toThrow(/not owned/);
      }
      expect(state.capturedStorage).toHaveLength(0);
      expect(state.captured).toHaveLength(0);
    });

    it("Accepts the case's assigned requestee", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: null }];

      await uploadCaseDocument("case-assigned", makeFile(), true);

      expect(state.capturedStorage.map((c) => c.kind)).toEqual(["upload"]);
    });

    it("Removes the uploaded file when its row can't be saved", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.storageResponses = [{ data: { path: "x" }, error: null }];
      state.responses = [{ error: { message: "insert failed", code: "XX000" } }];

      await expect(uploadCaseDocument("case-XYZ", makeFile(), true)).rejects.toMatchObject({
        message: "insert failed",
      });

      const [upload, remove] = state.capturedStorage;
      expect(remove).toEqual({
        kind: "remove",
        bucket: "case-documents",
        paths: [(upload as { path: string }).path],
      });
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
      state.responses = [
        { data: { storage_path: "case-A/abc.pdf" }, error: null }, // the caller's own row
        { error: null }, // row delete
      ];
      state.storageResponses = [{ data: { path: "x" }, error: null }];

      await deleteCaseDocument("doc-1");

      const remove = state.capturedStorage.find((c) => c.kind === "remove");
      expect(remove).toBeDefined();
      expect(remove!.bucket).toBe("case-documents");
      // The path comes from the row, never from the browser.
      expect((remove as { paths: string[] }).paths).toEqual(["case-A/abc.pdf"]);

      const rowDelete = state.captured.find(
        (c) => c.table === "case_documents" && c.ops.some((o) => o.op === "delete")
      )!;
      expect(rowDelete.eqs).toContainEqual(["id", "doc-1"]);
    });

    it("Owner-only deletion", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [
        { data: { storage_path: "case-A/abc.pdf" }, error: null },
        { error: null },
      ];
      state.storageResponses = [{ data: { path: "x" }, error: null }];

      await deleteCaseDocument("doc-1");

      // The owner-only guard is the .eq("uploaded_by", user.id) filter, on the
      // read that finds the file and on the delete — any call that does not
      // carry it scoped to the caller's id is a regression.
      const calls = state.captured.filter((c) => c.table === "case_documents");
      expect(calls).toHaveLength(2);
      for (const call of calls) expect(call.eqs).toContainEqual(["uploaded_by", "req-1"]);
    });

    it("Deletes no file for a document that isn't the caller's", async () => {
      // Someone else's document, or no such document: the read finds no row,
      // so no file is removed whatever path the browser might have sent.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [{ data: null, error: null }];

      await expect(deleteCaseDocument("doc-of-someone-else")).rejects.toThrow(/Document not found/);
      expect(state.capturedStorage).toHaveLength(0);
      expect(state.captured.some((c) => c.ops.some((o) => o.op === "delete"))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // case-document-url.test.ts — real getCaseDocumentUrl
  // -------------------------------------------------------------------------
  describe("case-document-url.test.ts", () => {
    let getCaseDocumentUrl: (typeof import("@/app/dashboard/requestee/actions/caseDocuments"))["getCaseDocumentUrl"];
    beforeAll(async () => {
      ({ getCaseDocumentUrl } = await import(
        "@/app/dashboard/requestee/actions/caseDocuments"
      ));
    });

    it("Signs the file of a document on the caller's own case", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [{ data: { case_id: "case-A", storage_path: "case-A/abc.pdf" }, error: null }];
      state.storageResponses = [{ data: { signedUrl: "https://storage.test/signed" }, error: null }];

      expect(await getCaseDocumentUrl("doc-1")).toBe("https://storage.test/signed");
      expect(state.capturedStorage).toEqual([{ kind: "sign", bucket: "case-documents", path: "case-A/abc.pdf" }]);
    });

    it("Signs nothing for a document on someone else's case, or one it can't see", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [
        { data: { case_id: "case-other", storage_path: "case-other/x.pdf" }, error: null },
        { data: null, error: null },
      ];

      await expect(getCaseDocumentUrl("doc-planted")).rejects.toThrow(/Document not found/);
      await expect(getCaseDocumentUrl("doc-hidden")).rejects.toThrow(/Document not found/);
      expect(state.capturedStorage).toHaveLength(0);
    });

    it("Refuses a signed-out caller", async () => {
      await expect(getCaseDocumentUrl("doc-1")).rejects.toThrow(/Unauthorized/);
      expect(state.captured).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // add-drive-link.test.ts — real addDriveLink, with its URL and owner checks
  // -------------------------------------------------------------------------
  describe("add-drive-link.test.ts", () => {
    let addDriveLink: (typeof import("@/app/dashboard/requestee/actions/caseDriveLinks"))["addDriveLink"];
    beforeAll(async () => {
      ({ addDriveLink } = await import(
        "@/app/dashboard/requestee/actions/caseDriveLinks"
      ));
    });

    it("Valid URL persists", async () => {
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };
      state.responses = [{ error: null }];

      await addDriveLink("case-1", "  https://drive.google.com/folders/abc ");

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
      // The link is opened by admins and goes into the presenter email as a
      // link, so only http(s) is accepted: no javascript:, data: or bare words.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };

      for (const url of [
        "not a real url",
        "drive.google.com/folders/abc",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://files.example/x",
      ]) {
        await expect(addDriveLink("case-1", url)).rejects.toThrow(/Invalid URL/);
      }
      // The DB layer was never touched
      expect(state.captured).toHaveLength(0);
      expect(state.adminReads).toHaveLength(0);
    });

    it("Refuses another firm's case", async () => {
      // The drive-link policy only checks uploaded_by, so without this a link
      // could be attached to anyone's case.
      state.user = { id: "req-1", user_metadata: { role: "requestee" } };

      await expect(addDriveLink("case-other", "https://evil.example/x")).rejects.toThrow(/not owned/);
      expect(state.captured).toHaveLength(0);
    });

    it("Refuses a signed-out caller", async () => {
      await expect(addDriveLink("case-1", "https://drive.google.com/x")).rejects.toThrow(/Unauthorized/);
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
