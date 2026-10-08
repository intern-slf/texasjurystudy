import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { UNDERAGE_MESSAGE } from "@/lib/age-gate";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";

// ---------------------------------------------------------------------------
// State + an ordered log of every mutating call, so tests can assert both what
// was deleted and that the login goes last. ID photos live in GCS now: the
// storage leg goes through @/lib/gcs/idDocuments (mocked below), while rows
// and the auth user still go through the Supabase admin client.
// ---------------------------------------------------------------------------
type Err = { message: string } | null;

const state: {
  user: { id: string } | null;
  role: { data: { role: string } | null; error: Err };
  profile: {
    // blacklisted_at is required: the real select always returns the key, null when unset.
    data: { driver_license_image_url: string | null; blacklisted_at: string | null } | null;
    error: Err;
  };
  blacklistLookupError: Err;
  files: { path: string; size: number; createdAt: string | null }[];
  deleteErrors: Record<string, Err>;
  deleteUserError: Err;
} = {
  user: null,
  role: { data: null, error: null },
  profile: { data: null, error: null },
  blacklistLookupError: null,
  files: [],
  deleteErrors: {},
  deleteUserError: null,
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
      select: vi.fn((columns: string) => ({
        // Honours its filter: a read keyed on anything but the caller's user_id finds no row,
        // so a wrong-key lookup can't pass for a correct one.
        eq: vi.fn((column: string, value: string) => ({
          maybeSingle: vi.fn(async () => {
            if (column !== "user_id" || value !== state.user?.id) return { data: null, error: null };
            if (table === "roles") return state.role;
            if (table !== "jury_participants") return { data: null, error: null };
            // Fails the blacklist check alone; the ID-photo lookup after it still succeeds.
            if (columns.includes("blacklisted_at") && state.blacklistLookupError) {
              return { data: null, error: state.blacklistLookupError };
            }
            return state.profile;
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: string) => {
          log.push(`delete ${table} ${column}=${value}`);
          return { error: state.deleteErrors[table] ?? null };
        }),
      })),
    })),
    auth: {
      admin: {
        deleteUser: vi.fn(async (id: string) => {
          log.push(`deleteUser ${id}`);
          return { data: null, error: state.deleteUserError };
        }),
      },
    },
  },
}));

// Like the table reads above, the listing answers only for the caller's own
// folder, so a wrong-key list can't pass for the right one. An empty remove is
// a no-op by the module's contract, so only non-empty removes are logged as
// mutations; a throw here would surface as deleted:false, which no test wants.
vi.mock("@/lib/gcs/idDocuments", () => ({
  listIdPhotos: vi.fn(async (userId: string) => (userId === state.user?.id ? state.files : [])),
  removeIdPhotos: vi.fn(async (paths: string[]) => {
    if (paths.length > 0) log.push(`remove ${paths.join(",")}`);
  }),
  createReadUrl: vi.fn(async (path: string) => `https://signed.example/read/${path}`),
  createUploadUrl: vi.fn(async (path: string) => `https://signed.example/upload/${path}`),
}));

const idFile = (path: string) => ({ path, size: 1024, createdAt: "2026-01-01T00:00:00Z" });

const ADULT_DOB = "1990-06-15";
// Relative to the real clock so this stays under 18 whenever the suite runs.
const CHILD_DOB = `${new Date().getFullYear() - 10}-01-01`;

const ROWS_THEN_LOGIN = (id: string) => [
  `delete session_participants participant_id=${id}`,
  `delete jury_participants user_id=${id}`,
  `delete confidentiality_agreements user_id=${id}`,
  `delete roles user_id=${id}`,
  `deleteUser ${id}`,
];

describe("deleteAccountIfUnderage", () => {
  let deleteAccountIfUnderage: (typeof import("@/lib/actions/underageAccount"))["deleteAccountIfUnderage"];
  beforeAll(async () => {
    ({ deleteAccountIfUnderage } = await import("@/lib/actions/underageAccount"));
  });

  beforeEach(() => {
    state.user = { id: "kid-1" };
    state.role = { data: { role: "participant" }, error: null };
    state.profile = { data: null, error: null };
    state.blacklistLookupError = null;
    state.files = [];
    state.deleteErrors = {};
    state.deleteUserError = null;
    log.length = 0;
  });

  it("deletes nothing for an adult", async () => {
    expect(await deleteAccountIfUnderage(ADULT_DOB)).toEqual({ deleted: false });
    expect(log).toEqual([]);
  });

  it("deletes nothing for a missing, malformed or future date (a form error, not an age)", async () => {
    for (const dob of ["", "2001-02-29", "tomorrow", `${new Date().getFullYear() + 1}-01-01`]) {
      expect(await deleteAccountIfUnderage(dob)).toEqual({ deleted: false });
    }
    expect(log).toEqual([]);
  });

  it("removes the ID images, every row and then the login — all for the caller only", async () => {
    state.profile = { data: { driver_license_image_url: "kid-1/111-id.jpg", blacklisted_at: null }, error: null };
    state.files = [idFile("kid-1/111-id.jpg"), idFile("kid-1/222-id.png")];

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({ deleted: true });
    expect(log).toEqual([
      "remove kid-1/111-id.jpg,kid-1/222-id.png",
      ...ROWS_THEN_LOGIN("kid-1"),
    ]);
  });

  it("never removes a linked ID image outside the user's own folder", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.files = [idFile("kid-1/111-id.jpg")];
    // The participant can write this column, so it may point into someone else's folder.
    for (const linked of ["other-user/1-id.jpg", "legacy/kid-1.jpg", "kid-1/../other-user/1-id.jpg"]) {
      state.profile = { data: { driver_license_image_url: linked, blacklisted_at: null }, error: null };
      log.length = 0;
      warnSpy.mockClear();

      expect(await deleteAccountIfUnderage(CHILD_DOB), linked).toEqual({ deleted: true });
      // Their own folder is still cleared; the outside link is left and logged by id.
      expect(log[0], linked).toBe("remove kid-1/111-id.jpg");
      expect(warnSpy.mock.calls.flat().join(" "), linked).toContain("kid-1");
    }
    warnSpy.mockRestore();
  });

  it("deletes a legacy participant with no roles row, and skips storage when there's nothing in it", async () => {
    state.role = { data: null, error: null };

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({ deleted: true });
    expect(log).toEqual(ROWS_THEN_LOGIN("kid-1"));
  });

  it("refuses a blacklisted participant without deleting anything, whether roles or blacklisted_at says so", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A photo on file, so anything that slipped through would show up in the log.
    state.files = [idFile("kid-1/111-id.jpg")];
    const cases: Array<[label: string, role: { role: string } | null, blacklistedAt: string | null]> = [
      ["roles says blacklisted", { role: "blacklisted" }, null],
      ["participant role, blacklisted_at set", { role: "participant" }, "2026-09-01T12:00:00Z"],
      ["no roles row, blacklisted_at set", null, "2026-09-01T12:00:00Z"],
    ];

    for (const [label, role, blacklistedAt] of cases) {
      state.role = { data: role, error: null };
      state.profile = {
        data: { driver_license_image_url: "kid-1/111-id.jpg", blacklisted_at: blacklistedAt },
        error: null,
      };
      warnSpy.mockClear();

      expect(await deleteAccountIfUnderage(CHILD_DOB), label).toEqual({
        deleted: false,
        error: `${UNDERAGE_MESSAGE} To close your account, please email ${SUPPORT_EMAIL}.`,
      });
      expect(log, label).toEqual([]);
      // Logged by id so an admin can match it to their email — never with the date of birth.
      const warned = warnSpy.mock.calls.flat().join(" ");
      expect(warned, label).toContain("kid-1");
      expect(warned, label).not.toContain(CHILD_DOB);
    }
    warnSpy.mockRestore();
  });

  it("refuses admins and requestees without deleting anything", async () => {
    for (const role of ["admin", "requestee"]) {
      state.role = { data: { role }, error: null };
      expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({
        deleted: false,
        error: UNDERAGE_MESSAGE,
      });
    }
    expect(log).toEqual([]);
  });

  it("deletes nothing when signed out", async () => {
    state.user = null;

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toMatchObject({ deleted: false, error: expect.any(String) });
    expect(log).toEqual([]);
  });

  it("deletes nothing when it can't check the blacklist", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Only the blacklist read fails, and there's a photo to remove, so deleting anyway would show.
    state.profile = { data: { driver_license_image_url: "kid-1/111-id.jpg", blacklisted_at: null }, error: null };
    state.files = [idFile("kid-1/111-id.jpg")];
    state.blacklistLookupError = { message: "timeout" };

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toMatchObject({
      deleted: false,
      error: expect.stringContaining("contact us"),
    });
    expect(log).toEqual([]);
    consoleSpy.mockRestore();
  });

  it("stops before removing the login when a row can't be deleted, so a retry can finish", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.deleteErrors = { jury_participants: { message: "boom" } };

    const result = await deleteAccountIfUnderage(CHILD_DOB);
    expect(result).toMatchObject({ deleted: false, error: expect.stringContaining("contact us") });
    expect(log).not.toContain("deleteUser kid-1");
    // Logged by id so an admin can finish by hand — never with the date of birth.
    expect(consoleSpy.mock.calls.flat().join(" ")).toContain("kid-1");
    expect(consoleSpy.mock.calls.flat().join(" ")).not.toContain(CHILD_DOB);
    consoleSpy.mockRestore();
  });

  it("reports a failed login delete instead of claiming success", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.deleteUserError = { message: "auth down" };

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toMatchObject({ deleted: false });
    consoleSpy.mockRestore();
  });
});
