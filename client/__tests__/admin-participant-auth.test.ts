import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// The actions in lib/actions/adminParticipant.ts are server actions, so anyone
// signed in can call them with any participant's id. These pin that each one
// checks for an admin (lib/requireAdmin.ts) before reading or writing anything.
// sendReactivationEmails is pinned in reactivation-email.test.ts.
// ---------------------------------------------------------------------------
const caller: { id: string | null; role: string | null } = { id: null, role: null };
const writes: Array<{ table: string; verb: string; payload?: unknown }> = [];
const reads: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: caller.id ? { id: caller.id } : null } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: caller.role ? { role: caller.role } : null, error: null })),
        })),
      })),
    })),
  })),
}));

// A chain where every method returns the chain, and awaiting it (or single())
// resolves without error. Logs reads and writes per table.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["eq", "not", "in", "is", "or"]) chain[method] = vi.fn(() => chain);
      chain.select = vi.fn(() => {
        reads.push(table);
        return chain;
      });
      chain.update = vi.fn((payload: unknown) => {
        writes.push({ table, verb: "update", payload });
        return chain;
      });
      chain.upsert = vi.fn((payload: unknown) => {
        writes.push({ table, verb: "upsert", payload });
        return chain;
      });
      chain.single = vi.fn(async () => ({ data: { email: "p@example.com", first_name: "P" }, error: null }));
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
      return chain;
    }),
  },
}));

vi.mock("@/lib/mail", () => ({
  sendProfileUpdatedEmail: vi.fn(async () => undefined),
  sendReactivationEmail: vi.fn(async () => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Actions = typeof import("@/lib/actions/adminParticipant");

describe("admin participant actions require an admin", () => {
  let actions: Actions;
  beforeAll(async () => {
    actions = await import("@/lib/actions/adminParticipant");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  beforeEach(() => {
    caller.id = "admin-1";
    caller.role = "admin";
    writes.length = 0;
    reads.length = 0;
  });

  const calls: Array<[name: string, run: (a: Actions) => Promise<unknown>, tables: string[]]> = [
    ["verifyParticipant", (a) => a.verifyParticipant("p-1"), ["jury_participants"]],
    ["blacklistParticipant", (a) => a.blacklistParticipant("p-1", "No-show"), ["roles", "jury_participants"]],
    ["unblacklistParticipant", (a) => a.unblacklistParticipant("p-1"), ["roles", "jury_participants", "session_participants"]],
    ["adminUpdateParticipant", (a) => a.adminUpdateParticipant("p-1", { paypal_username: "someone-else" }), ["jury_participants"]],
    ["adminUpdateParticipantDob", (a) => a.adminUpdateParticipantDob("p-1", "1990-06-15"), ["jury_participants"]],
  ];

  for (const [name, run, tables] of calls) {
    describe(name, () => {
      it("refuses a participant, even for their own id, and a requestee or blacklisted login", async () => {
        caller.id = "p-1";
        for (const role of ["participant", "requestee", "blacklisted", null]) {
          caller.role = role;
          await expect(run(actions)).rejects.toThrow("Not authorized");
        }
        expect(writes).toEqual([]);
        expect(reads).toEqual([]);
      });

      it("refuses a signed-out caller", async () => {
        caller.id = null;
        await expect(run(actions)).rejects.toThrow("Not authenticated");
        expect(writes).toEqual([]);
      });

      it("runs for an admin", async () => {
        await run(actions);
        expect(writes.map((write) => write.table)).toEqual(tables);
      });
    });
  }
});
