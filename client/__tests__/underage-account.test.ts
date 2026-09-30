import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { UNDERAGE_MESSAGE } from "@/lib/age-gate";

// ---------------------------------------------------------------------------
// State + an ordered log of every mutating call, so tests can assert both what
// was deleted and that the login goes last.
// ---------------------------------------------------------------------------
type Err = { message: string } | null;

const state: {
  user: { id: string } | null;
  role: { data: { role: string } | null; error: Err };
  profile: { data: { driver_license_image_url: string | null } | null; error: Err };
  files: { name: string }[];
  deleteErrors: Record<string, Err>;
  deleteUserError: Err;
} = {
  user: null,
  role: { data: null, error: null },
  profile: { data: null, error: null },
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
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () =>
            table === "roles" ? state.role : table === "jury_participants" ? state.profile : { data: null, error: null }
          ),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: string) => {
          log.push(`delete ${table} ${column}=${value}`);
          return { error: state.deleteErrors[table] ?? null };
        }),
      })),
    })),
    storage: {
      from: vi.fn((bucket: string) => ({
        list: vi.fn(async () => ({ data: state.files, error: null })),
        remove: vi.fn(async (paths: string[]) => {
          log.push(`remove ${bucket} ${paths.join(",")}`);
          return { data: [], error: null };
        }),
      })),
    },
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
    state.profile = { data: { driver_license_image_url: "kid-1/111-id.jpg" }, error: null };
    state.files = [{ name: "111-id.jpg" }, { name: "222-id.png" }];

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({ deleted: true });
    expect(log).toEqual([
      "remove id-documents kid-1/111-id.jpg,kid-1/222-id.png",
      ...ROWS_THEN_LOGIN("kid-1"),
    ]);
  });

  it("also removes an ID image stored outside the user's folder", async () => {
    state.profile = { data: { driver_license_image_url: "legacy/kid-1.jpg" }, error: null };

    await deleteAccountIfUnderage(CHILD_DOB);
    expect(log[0]).toBe("remove id-documents legacy/kid-1.jpg");
  });

  it("deletes a legacy participant with no roles row, and skips storage when there's nothing in it", async () => {
    state.role = { data: null, error: null };

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({ deleted: true });
    expect(log).toEqual(ROWS_THEN_LOGIN("kid-1"));
  });

  it("deletes a blacklisted participant", async () => {
    state.role = { data: { role: "blacklisted" }, error: null };

    expect(await deleteAccountIfUnderage(CHILD_DOB)).toEqual({ deleted: true });
    expect(log).toContain("deleteUser kid-1");
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
