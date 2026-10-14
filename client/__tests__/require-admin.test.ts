import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// lib/requireAdmin.ts: the two checks every admin entry point starts with (F28).
// requireAdmin() is for server actions and throws; requireAdminPage() is for admin
// pages and redirects, because Admin/layout.tsx's own check can be skipped by an RSC
// request that says the layout is already on screen. Both read only the caller's
// own roles row, never user_metadata, which users can edit themselves.
// ---------------------------------------------------------------------------
const caller: { id: string | null; role: string | null; metadataRole?: string } = { id: null, role: null };
const rolesReads: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: caller.id ? { id: caller.id, user_metadata: { role: caller.metadataRole } } : null,
        },
      })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, userId: string) => ({
          maybeSingle: vi.fn(async () => {
            rolesReads.push(`${table}:${userId}`);
            return { data: caller.role ? { role: caller.role } : null, error: null };
          }),
        })),
      })),
    })),
  })),
}));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

describe("requireAdmin / requireAdminPage", () => {
  let mod: typeof import("@/lib/requireAdmin");
  beforeAll(async () => {
    mod = await import("@/lib/requireAdmin");
  });

  beforeEach(() => {
    caller.id = "admin-1";
    caller.role = "admin";
    caller.metadataRole = undefined;
    rolesReads.length = 0;
  });

  it("both return an admin's id, after reading only their own roles row", async () => {
    expect(await mod.requireAdmin()).toBe("admin-1");
    expect(await mod.requireAdminPage()).toBe("admin-1");
    expect(rolesReads).toEqual(["roles:admin-1", "roles:admin-1"]);
  });

  it("requireAdmin throws for anyone else, user_metadata notwithstanding", async () => {
    caller.id = "req-1";
    caller.metadataRole = "admin";
    for (const role of ["requestee", "participant", "blacklisted", null]) {
      caller.role = role;
      await expect(mod.requireAdmin()).rejects.toThrow("Not authorized");
    }
    caller.id = null;
    await expect(mod.requireAdmin()).rejects.toThrow("Not authenticated");
  });

  it("requireAdminPage sends a non-admin to their own dashboard, and a signed-out visitor to log in", async () => {
    caller.id = "req-1";
    caller.metadataRole = "admin";
    for (const role of ["requestee", "participant", "blacklisted", null]) {
      caller.role = role;
      await expect(mod.requireAdminPage()).rejects.toMatchObject({ url: "/dashboard" });
    }
    caller.id = null;
    await expect(mod.requireAdminPage()).rejects.toMatchObject({ url: "/auth/login" });
    // Signed out: refused before any roles read.
    expect(rolesReads).not.toContain("roles:null");
  });
});
