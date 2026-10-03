import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// State + a log of every read and write, so tests can assert both what changed
// and that a refused caller never gets as far as reading the participant.
// The real markBlacklisted (lib/participant/blacklist.ts) runs on the same mock.
// ---------------------------------------------------------------------------
type Err = { message: string; code?: string } | null;
type Participant = { convicted_felon: string; us_citizen: string; blacklisted_at: string | null };
type Call =
  | { op: "select"; table: string; userId: string }
  | { op: "update"; table: string; userId: string; values: Record<string, unknown> }
  | { op: "upsert"; table: string; userId: string; values: Record<string, unknown>; options: unknown };

const state: {
  user: { id: string } | null;
  roles: Record<string, string>;
  participant: Participant | null;
  participantError: Err;
  roleWriteError: Err;
  updateError: Err;
} = { user: null, roles: {}, participant: null, participantError: null, roleWriteError: null, updateError: null };

const log: Call[] = [];

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
        eq: vi.fn((_column: string, userId: string) => ({
          maybeSingle: vi.fn(async () => {
            log.push({ op: "select", table, userId });
            if (table === "roles") {
              return { data: state.roles[userId] ? { role: state.roles[userId] } : null, error: null };
            }
            return { data: state.participant, error: state.participantError };
          }),
        })),
      })),
      update: vi.fn((values: Record<string, unknown>) => ({
        eq: vi.fn(async (_column: string, userId: string) => {
          log.push({ op: "update", table, userId, values });
          return { error: state.updateError };
        }),
      })),
      upsert: vi.fn(async (values: Record<string, unknown>, options: unknown) => {
        log.push({ op: "upsert", table, userId: String(values.user_id), values, options });
        return { error: state.roleWriteError };
      }),
    })),
  },
}));

const P = "p-1";
const ELIGIBLE: Participant = { convicted_felon: "No", us_citizen: "Yes", blacklisted_at: null };
const writes = () => log.filter((call) => call.op !== "select");
const blacklisted = (reason: string) => [
  {
    op: "upsert",
    table: "roles",
    userId: P,
    values: { user_id: P, role: "blacklisted" },
    options: { onConflict: "user_id" },
  },
  {
    op: "update",
    table: "jury_participants",
    userId: P,
    values: { blacklist_reason: reason, blacklisted_at: expect.any(String), approved_by_admin: false },
  },
];

beforeEach(() => {
  state.user = { id: P };
  state.roles = { [P]: "participant" };
  state.participant = { ...ELIGIBLE };
  state.participantError = null;
  state.roleWriteError = null;
  state.updateError = null;
  log.length = 0;
});

describe("autoBlacklistIfIneligible", () => {
  let autoBlacklistIfIneligible: (typeof import("@/lib/actions/autoBlacklist"))["autoBlacklistIfIneligible"];
  beforeAll(async () => {
    ({ autoBlacklistIfIneligible } = await import("@/lib/actions/autoBlacklist"));
  });

  describe("blacklisting from the saved answers", () => {
    it("blacklists a participant whose saved answer says convicted felon", async () => {
      state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Convicted felon"));
    });

    it("names each reason that applies", async () => {
      state.participant = { ...ELIGIBLE, us_citizen: "No" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Not a US citizen"));

      log.length = 0;
      state.participant = { ...ELIGIBLE, convicted_felon: "Yes", us_citizen: "No" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Convicted felon, Not a US citizen"));
    });

    it("changes nothing for a participant whose saved answers are fine", async () => {
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual([]);
    });

    it("blacklists a legacy participant with no roles row, unless their row already says blacklisted", async () => {
      state.roles = {};
      state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Convicted felon"));

      log.length = 0;
      state.participant = { ...state.participant, blacklisted_at: "2026-01-01" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual([]);
    });

    it("goes by roles, not the participant's own row, which they can write to", async () => {
      // A participant can set blacklisted_at on their own row from the browser; that
      // mustn't let them dodge being blacklisted in roles, which they can't write.
      state.participant = { convicted_felon: "Yes", us_citizen: "Yes", blacklisted_at: "2026-01-01" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Convicted felon"));
    });
  });

  describe("never lifting a blacklist", () => {
    it("leaves a blacklist in place when the answers are fine, whoever set it", async () => {
      state.roles = { [P]: "blacklisted" };
      state.participant = { ...ELIGIBLE, blacklisted_at: "2026-01-01" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual([]);
    });

    it("leaves an existing blacklist and its reason alone when an answer turns ineligible", async () => {
      state.roles = { [P]: "blacklisted" };
      state.participant = { convicted_felon: "Yes", us_citizen: "No", blacklisted_at: "2026-01-01" };
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual([]);
    });
  });

  describe("who may call it", () => {
    it("refuses anyone but the participant or an admin, before reading the participant", async () => {
      for (const role of ["participant", "requestee", "blacklisted", undefined]) {
        state.user = { id: "someone-else" };
        state.roles = { [P]: "participant", ...(role ? { "someone-else": role } : {}) };
        state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };
        await autoBlacklistIfIneligible(P);
      }
      expect(writes()).toEqual([]);
      expect(log.every((call) => call.op === "select" && call.table === "roles" && call.userId === "someone-else")).toBe(true);
    });

    it("lets an admin run it for the participant they just edited", async () => {
      state.user = { id: "admin-1" };
      state.roles = { "admin-1": "admin", [P]: "participant" };
      state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };

      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual(blacklisted("Convicted felon"));
    });

    it("does nothing when signed out or given no id", async () => {
      state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };
      await autoBlacklistIfIneligible("");
      state.user = null;
      await autoBlacklistIfIneligible(P);
      expect(log).toEqual([]);
    });

    it("never touches an admin or a requestee, whatever their row says", async () => {
      for (const role of ["admin", "requestee"]) {
        state.roles = { [P]: role };
        state.participant = { convicted_felon: "Yes", us_citizen: "No", blacklisted_at: null };
        await autoBlacklistIfIneligible(P);
      }
      expect(writes()).toEqual([]);
    });

    it("does nothing for someone with no participant profile", async () => {
      state.participant = null;
      await autoBlacklistIfIneligible(P);
      expect(writes()).toEqual([]);
    });
  });

  it("logs and returns instead of throwing, so a save that already succeeded isn't failed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    state.participantError = { message: "db down" };
    await expect(autoBlacklistIfIneligible(P)).resolves.toBeUndefined();

    state.participantError = null;
    state.participant = { ...ELIGIBLE, convicted_felon: "Yes" };
    state.updateError = { message: "update failed" };
    await expect(autoBlacklistIfIneligible(P)).resolves.toBeUndefined();

    expect(consoleSpy.mock.calls.flat().join(" ")).toContain(P);
    consoleSpy.mockRestore();
  });
});

describe("markBlacklisted", () => {
  let markBlacklisted: (typeof import("@/lib/participant/blacklist"))["markBlacklisted"];
  beforeAll(async () => {
    ({ markBlacklisted } = await import("@/lib/participant/blacklist"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("upserts the roles row, so a participant who has none gets one they can't clear", async () => {
    await markBlacklisted(P, "No-show");
    expect(writes()).toEqual(blacklisted("No-show"));
  });

  it("still writes jury_participants when the roles write fails, then reports the failure", async () => {
    state.roleWriteError = { message: "timeout", code: "57014" };
    await expect(markBlacklisted(P, "No-show")).rejects.toThrow("roles upsert: timeout");
    expect(writes().map((call) => call.table)).toEqual(["roles", "jury_participants"]);
  });

  it("blacklists a profile with no login on jury_participants alone, without an error", async () => {
    // roles.user_id references auth.users (23503); such a profile can't be invited anyway.
    state.roleWriteError = { message: "violates foreign key constraint", code: "23503" };
    await expect(markBlacklisted(P, "No-show")).resolves.toBeUndefined();
    expect(writes().map((call) => call.table)).toEqual(["roles", "jury_participants"]);
  });

  it("names both failures when both writes fail", async () => {
    state.roleWriteError = { message: "timeout", code: "57014" };
    state.updateError = { message: "also down" };
    await expect(markBlacklisted(P, "No-show")).rejects.toThrow(
      "roles upsert: timeout; jury_participants update: also down"
    );
  });
});
