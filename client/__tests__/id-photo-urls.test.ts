import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// ID photos live in GCS now, and GCS has no RLS: the two server actions in
// lib/actions/idPhotoUrls.ts are the entire security boundary in front of the
// id-documents bucket, replacing the Supabase storage policies (owner ALL /
// admin SELECT / admin UPDATE — kept in rls.test.ts only until the old bucket
// is deleted). The GCS module is mocked so every signing call lands in an
// ordered log, and the tests assert both who gets a URL and that a refused
// caller never reaches storage.
// ---------------------------------------------------------------------------
type Err = { message: string } | null;

const state: {
  user: { id: string } | null;
  role: { data: { role: string } | null; error: Err };
  profile: { data: { driver_license_image_url: string | null } | null; error: Err };
} = {
  user: null,
  role: { data: null, error: null },
  profile: { data: null, error: null },
};

const log: string[] = [];

// Both Supabase clients answer reads the same way, and only for lookups keyed
// on the caller's own user_id — so the "path the caller's own profile links"
// rule can never be satisfied by reading someone else's row.
const tableRead = (table: string) => ({
  select: vi.fn(() => ({
    eq: vi.fn((column: string, value: string) => ({
      maybeSingle: vi.fn(async () => {
        if (column !== "user_id" || value !== state.user?.id) return { data: null, error: null };
        if (table === "roles") return state.role;
        if (table === "jury_participants") return state.profile;
        return { data: null, error: null };
      }),
    })),
  })),
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
    },
    from: vi.fn((table: string) => tableRead(table)),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => tableRead(table)),
  },
}));

// The whole GCS module is replaced, so no test constructs a Storage client or
// needs the GCS env vars. The actions must hand back these URLs verbatim.
vi.mock("@/lib/gcs/idDocuments", () => ({
  listIdPhotos: vi.fn(async () => []),
  removeIdPhotos: vi.fn(async () => {}),
  createReadUrl: vi.fn(async (path: string) => {
    log.push(`readUrl ${path}`);
    return `https://signed.example/read/${path}`;
  }),
  createUploadUrl: vi.fn(async (path: string, contentType: string) => {
    log.push(`uploadUrl ${path} ${contentType}`);
    return `https://signed.example/upload/${path}`;
  }),
}));

// The error wording is the actions' own; what matters is that it IS the error
// arm and no URL leaks out alongside it.
const expectError = (result: unknown) => {
  expect(result).toMatchObject({ error: expect.any(String) });
  expect(result).not.toHaveProperty("url");
};

describe("idPhotoUrls", () => {
  let getIdPhotoReadUrl: (typeof import("@/lib/actions/idPhotoUrls"))["getIdPhotoReadUrl"];
  let getIdPhotoUploadUrl: (typeof import("@/lib/actions/idPhotoUrls"))["getIdPhotoUploadUrl"];
  beforeAll(async () => {
    ({ getIdPhotoReadUrl, getIdPhotoUploadUrl } = await import("@/lib/actions/idPhotoUrls"));
  });

  beforeEach(() => {
    state.user = { id: "p-1" };
    state.role = { data: { role: "participant" }, error: null };
    state.profile = { data: { driver_license_image_url: null }, error: null };
    log.length = 0;
  });

  describe("getIdPhotoReadUrl", () => {
    it("signs a read URL for any file in the caller's own folder, not just the linked one", async () => {
      expect(await getIdPhotoReadUrl("p-1/100-id.jpg")).toEqual({
        url: "https://signed.example/read/p-1/100-id.jpg",
      });
      expect(log).toEqual(["readUrl p-1/100-id.jpg"]);
    });

    it("still serves an owner with no roles row (legacy logins)", async () => {
      state.role = { data: null, error: null };
      expect(await getIdPhotoReadUrl("p-1/100-id.jpg")).toEqual({
        url: "https://signed.example/read/p-1/100-id.jpg",
      });
    });

    it("refuses a signed-out caller without signing anything", async () => {
      state.user = null;
      expectError(await getIdPhotoReadUrl("p-1/100-id.jpg"));
      expect(log).toEqual([]);
    });

    it("signs any path for an admin, including legacy out-of-folder ones", async () => {
      state.user = { id: "admin-1" };
      state.role = { data: { role: "admin" }, error: null };
      state.profile = { data: null, error: null };

      expect(await getIdPhotoReadUrl("p-9/1-id.jpg")).toEqual({
        url: "https://signed.example/read/p-9/1-id.jpg",
      });
      expect(await getIdPhotoReadUrl("legacy/p-9.jpg")).toEqual({
        url: "https://signed.example/read/legacy/p-9.jpg",
      });
    });

    it("refuses everyone else another user's path, without signing anything", async () => {
      for (const role of ["participant", "requestee", "blacklisted"]) {
        state.user = { id: "p-2" };
        state.role = { data: { role }, error: null };
        state.profile = { data: { driver_license_image_url: "p-2/1-id.jpg" }, error: null };
        expectError(await getIdPhotoReadUrl("p-1/100-id.jpg"));
      }
      state.role = { data: null, error: null };
      expectError(await getIdPhotoReadUrl("p-1/100-id.jpg"));
      expect(log).toEqual([]);
    });

    it("signs exactly the out-of-folder path the caller's own profile links (legacy rows)", async () => {
      state.profile = { data: { driver_license_image_url: "legacy/p-1.jpg" }, error: null };

      expect(await getIdPhotoReadUrl("legacy/p-1.jpg")).toEqual({
        url: "https://signed.example/read/legacy/p-1.jpg",
      });
      // A near miss in the same legacy folder is still someone else's file.
      expectError(await getIdPhotoReadUrl("legacy/p-2.jpg"));
      expect(log).toEqual(["readUrl legacy/p-1.jpg"]);
    });

    it("never lets a self-set profile link unlock another user's folder", async () => {
      // driver_license_image_url is participant-writable, so a caller can point
      // their own row at a victim's exact object path; real folders are UUIDs.
      const victim = "7c9e6679-7425-40de-963d-02d1cf0c9b7a";
      state.user = { id: "a2f6f6f2-8c1b-4d2e-9d3a-5b1e2c3d4e5f" };
      state.profile = {
        data: { driver_license_image_url: `${victim}/100-id.jpg` },
        error: null,
      };

      expectError(await getIdPhotoReadUrl(`${victim}/100-id.jpg`));
      expect(log).toEqual([]);
    });

    it("rejects traversal, absolute and gs:// paths before any check, even for an admin", async () => {
      state.user = { id: "admin-1" };
      state.role = { data: { role: "admin" }, error: null };
      for (const path of [
        "p-1/../p-2/100-id.jpg",
        "../100-id.jpg",
        "/p-1/100-id.jpg",
        "gs://texasjurystudy-id-documents/p-1/100-id.jpg",
      ]) {
        expectError(await getIdPhotoReadUrl(path));
      }

      // Starting inside the caller's own folder doesn't make ".." safe.
      state.user = { id: "p-1" };
      state.role = { data: { role: "participant" }, error: null };
      expectError(await getIdPhotoReadUrl("p-1/../p-2/100-id.jpg"));
      expect(log).toEqual([]);
    });
  });

  describe("getIdPhotoUploadUrl", () => {
    it("signs an upload for the caller themselves, at a server-built path", async () => {
      const before = Date.now();
      const result = await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "jpg", contentType: "image/jpeg" });
      const after = Date.now();

      expect(result).toMatchObject({
        url: expect.any(String),
        path: expect.stringMatching(/^p-1\/\d+-id\.jpg$/),
      });
      const { url, path } = result as { url: string; path: string };
      // The timestamp in the path is the server's clock, taken during the call.
      const stamp = Number(path.slice("p-1/".length).split("-")[0]);
      expect(stamp).toBeGreaterThanOrEqual(before);
      expect(stamp).toBeLessThanOrEqual(after);
      // The signing call carries exactly the returned path and content type.
      expect(log).toEqual([`uploadUrl ${path} image/jpeg`]);
      expect(url).toBe(`https://signed.example/upload/${path}`);
    });

    it("accepts every whitelisted extension", async () => {
      for (const [ext, contentType] of [
        ["jpg", "image/jpeg"],
        ["jpeg", "image/jpeg"],
        ["png", "image/png"],
        ["webp", "image/webp"],
      ] as const) {
        const result = await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: ext, contentType });
        expect(result, ext).toMatchObject({
          path: expect.stringMatching(new RegExp(`^p-1/\\d+-id\\.${ext}$`)),
        });
      }
    });

    it("lets an admin upload into a participant's folder (the admin edit flow)", async () => {
      state.user = { id: "admin-1" };
      state.role = { data: { role: "admin" }, error: null };

      const result = await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "png", contentType: "image/png" });
      expect(result).toMatchObject({ path: expect.stringMatching(/^p-1\/\d+-id\.png$/) });
    });

    it("refuses everyone else another user's folder, without signing anything", async () => {
      for (const role of ["participant", "requestee", "blacklisted"]) {
        state.user = { id: "p-2" };
        state.role = { data: { role }, error: null };
        expectError(await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "jpg", contentType: "image/jpeg" }));
      }
      state.role = { data: null, error: null };
      expectError(await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "jpg", contentType: "image/jpeg" }));
      expect(log).toEqual([]);
    });

    it("refuses a signed-out caller", async () => {
      state.user = null;
      expectError(await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "jpg", contentType: "image/jpeg" }));
      expect(log).toEqual([]);
    });

    it("refuses extensions outside the whitelist before any signing call", async () => {
      for (const fileExt of ["exe", "jpg.exe", ""]) {
        expectError(await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt, contentType: "image/jpeg" }));
      }
      expect(log).toEqual([]);
    });

    it("refuses a content type that isn't image/*, before any signing call", async () => {
      for (const contentType of ["application/pdf", "text/html", ""]) {
        expectError(await getIdPhotoUploadUrl({ targetUserId: "p-1", fileExt: "jpg", contentType }));
      }
      expect(log).toEqual([]);
    });

    it("never uses a caller-supplied path", async () => {
      // A compromised client smuggling a path must not choose where the upload lands.
      const smuggled = { targetUserId: "p-1", fileExt: "png", contentType: "image/png", path: "p-1/evil.png" };
      const result = await getIdPhotoUploadUrl(smuggled as Parameters<typeof getIdPhotoUploadUrl>[0]);

      expect(result).toMatchObject({ path: expect.stringMatching(/^p-1\/\d+-id\.png$/) });
      const { path } = result as { url: string; path: string };
      expect(path).not.toBe("p-1/evil.png");
      expect(log).toEqual([`uploadUrl ${path} image/png`]);
    });
  });
});
