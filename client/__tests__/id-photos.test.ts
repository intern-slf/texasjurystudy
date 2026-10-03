import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// State + a log of every storage call, so tests can assert exactly which folder
// was listed and which files were removed.
// ---------------------------------------------------------------------------
type Err = { message: string } | null;

const state: {
  user: { id: string } | null;
  role: { data: { role: string } | null; error: Err };
  profile: { data: { driver_license_image_url: string | null } | null; error: Err };
  files: { id?: string | null; name: string; created_at?: string }[];
  listError: Err;
  removeError: Err;
} = {
  user: null,
  role: { data: null, error: null },
  profile: { data: null, error: null },
  files: [],
  listError: null,
  removeError: null,
};

const log: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () =>
            table === "roles" ? state.role : table === "jury_participants" ? state.profile : { data: null, error: null }
          ),
        })),
      })),
    })),
    storage: {
      from: vi.fn((bucket: string) => ({
        list: vi.fn(async (prefix: string) => {
          log.push(`list ${bucket} ${prefix}`);
          return { data: state.listError ? null : state.files, error: state.listError };
        }),
        remove: vi.fn(async (paths: string[]) => {
          log.push(`remove ${bucket} ${paths.join(",")}`);
          return { data: [], error: state.removeError };
        }),
      })),
    },
  },
}));

const CURRENT = "p-1/300-id.jpg";
const LONG_AGO = "2026-01-01T00:00:00Z";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("removeReplacedIdPhotos", () => {
  let removeReplacedIdPhotos: (typeof import("@/lib/actions/idPhotos"))["removeReplacedIdPhotos"];
  beforeAll(async () => {
    ({ removeReplacedIdPhotos } = await import("@/lib/actions/idPhotos"));
  });

  beforeEach(() => {
    state.user = { id: "p-1" };
    state.role = { data: { role: "participant" }, error: null };
    state.profile = { data: { driver_license_image_url: CURRENT }, error: null };
    state.files = [
      { id: "a", name: "100-id.jpg", created_at: LONG_AGO },
      { id: "b", name: "200-id.png", created_at: LONG_AGO },
      { id: "c", name: "300-id.jpg", created_at: LONG_AGO },
    ];
    state.listError = null;
    state.removeError = null;
    log.length = 0;
  });

  it("removes a participant's replaced photos and keeps the one their profile points at", async () => {
    expect(await removeReplacedIdPhotos("p-1")).toBe(2);
    expect(log).toEqual([
      "list id-documents p-1",
      "remove id-documents p-1/100-id.jpg,p-1/200-id.png",
    ]);
  });

  it("lets an admin clean up the participant whose photo they replaced", async () => {
    state.user = { id: "admin-1" };
    state.role = { data: { role: "admin" }, error: null };

    expect(await removeReplacedIdPhotos("p-1")).toBe(2);
    expect(log).toContain("remove id-documents p-1/100-id.jpg,p-1/200-id.png");
  });

  it("refuses anyone else, without even listing the folder", async () => {
    for (const role of ["participant", "requestee", "blacklisted"]) {
      state.user = { id: "someone-else" };
      state.role = { data: { role }, error: null };
      expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    }
    state.role = { data: null, error: null };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual([]);
  });

  it("does nothing when signed out or given no user id", async () => {
    expect(await removeReplacedIdPhotos("")).toBe(0);
    state.user = null;
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual([]);
  });

  it("removes nothing while the profile has no photo, so a save that didn't land can't lose the upload", async () => {
    state.profile = { data: { driver_license_image_url: null }, error: null };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    state.profile = { data: null, error: null };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual([]);
  });

  it("keeps a recent upload another save may be about to link, even one older than the current photo", async () => {
    // Another tab, or an admin, has just uploaded 100 or 400 and its profile update hasn't
    // landed yet. Deleting either would leave that save pointing at nothing; only 200,
    // half an hour old, goes.
    state.files = [
      { id: "a", name: "100-id.jpg", created_at: minutesAgo(2) },
      { id: "b", name: "200-id.png", created_at: minutesAgo(30) },
      { id: "c", name: "300-id.jpg", created_at: minutesAgo(1) },
      { id: "d", name: "400-id.jpg", created_at: minutesAgo(0) },
    ];

    expect(await removeReplacedIdPhotos("p-1")).toBe(1);
    expect(log).toContain("remove id-documents p-1/200-id.png");
  });

  it("keeps a file whose upload time is unknown", async () => {
    state.files = [{ id: "a", name: "100-id.jpg" }, { id: "c", name: "300-id.jpg", created_at: LONG_AGO }];
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual(["list id-documents p-1"]);
  });

  it("makes no remove call when the current photo is the only file", async () => {
    state.files = [{ id: "c", name: "300-id.jpg", created_at: LONG_AGO }];
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual(["list id-documents p-1"]);
  });

  it("leaves folders alone", async () => {
    state.files = [{ id: null, name: "nested", created_at: LONG_AGO }, { id: "c", name: "300-id.jpg", created_at: LONG_AGO }];
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).toEqual(["list id-documents p-1"]);
  });

  it("logs and returns 0 instead of throwing when storage fails, so the save still succeeds", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    state.listError = { message: "list down" };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);
    expect(log).not.toContain("remove id-documents p-1/100-id.jpg,p-1/200-id.png");

    state.listError = null;
    state.removeError = { message: "remove down" };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);

    state.removeError = null;
    state.profile = { data: null, error: { message: "db down" } };
    expect(await removeReplacedIdPhotos("p-1")).toBe(0);

    expect(consoleSpy.mock.calls.flat().join(" ")).toContain("p-1");
    consoleSpy.mockRestore();
  });
});
