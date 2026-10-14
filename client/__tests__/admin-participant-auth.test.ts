import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// The actions in lib/actions/adminParticipant.ts are server actions, so anyone
// signed in can call them with any participant's id. These pin that each one
// checks for an admin (lib/requireAdmin.ts) before reading or writing anything.
// sendReactivationEmails is pinned in reactivation-email.test.ts.
// ---------------------------------------------------------------------------
const caller: { id: string | null; role: string | null } = { id: null, role: null };
// The roles row of the participant being acted on, as blacklistParticipant reads it.
const target: { role: string | null; error: { message: string } | null } = { role: "participant", error: null };
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
      chain.maybeSingle = vi.fn(async () => ({
        data: target.role ? { role: target.role } : null,
        error: target.error,
      }));
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
    target.role = "participant";
    target.error = null;
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

  // -------------------------------------------------------------------------
  // What an admin's own call may do (F28). These write with the service role,
  // so they take only what the admin screens send.
  // -------------------------------------------------------------------------
  describe("blacklistParticipant only blacklists participants", () => {
    it("refuses an admin or a firm, the caller's own id included, before writing anything", async () => {
      // markBlacklisted overwrites the roles row: another admin would lose
      // admin, a firm its dashboard.
      for (const [id, role] of [["admin-1", "admin"], ["admin-2", "admin"], ["req-1", "requestee"]]) {
        target.role = role;
        await expect(actions.blacklistParticipant(id, "x")).rejects.toThrow("Only participants can be blacklisted.");
      }
      expect(writes).toEqual([]);
    });

    it("still blacklists a participant, one already blacklisted, and a profile with no roles row", async () => {
      for (const role of ["participant", "blacklisted", null]) {
        target.role = role;
        writes.length = 0;
        await actions.blacklistParticipant("p-1", "No-show");
        expect(writes.map((write) => write.table)).toEqual(["roles", "jury_participants"]);
      }
    });

    it("writes nothing when it can't read the target's role", async () => {
      target.error = { message: "roles lookup failed" };
      await expect(actions.blacklistParticipant("p-1", "No-show")).rejects.toThrow("roles lookup failed");
      expect(writes).toEqual([]);
    });
  });

  describe("adminUpdateParticipant writes only the edit form's fields", () => {
    const written = () =>
      writes.find((write) => write.table === "jury_participants" && write.verb === "update")!.payload as Record<string, unknown>;

    it("drops approval, the blacklist, strikes, the cooldown, reactivation, email and user_id", async () => {
      await actions.adminUpdateParticipant("p-1", {
        paypal_username: "new-pp",
        approved_by_admin: true,
        blacklisted_at: null,
        blacklist_reason: null,
        flag_count: -5,
        eligible_after_at: null,
        reactivation_status: "yes",
        email: "other@example.com",
        user_id: "p-2",
        id: "jp-9",
      });

      expect(written()).toEqual({ paypal_username: "new-pp", date_updated: expect.any(String) });
    });

    it("writes everything the form sends, except the unchanged email", async () => {
      // EditProfileForm's payload in admin mode (components/EditProfileForm.tsx).
      const formPayload: Record<string, unknown> = {
        first_name: "Pat", last_name: "Lee", gender: "Female", race: "White",
        email: "p@example.com", phone: "555-0100", street_address: "1 Main St",
        address_line_2: "", city: "Conroe", county: "Montgomery", state: "Texas",
        zip_code: "77301", country: "USA", availability_weekdays: "Yes",
        availability_weekends: "No", interested_in_offline: "Yes", served_on_jury: "No",
        convicted_felon: "No", us_citizen: "Yes", has_children: "No",
        served_armed_forces: "No", currently_employed: "Yes", marital_status: "Single",
        political_affiliation: "Independent", education_level: "Bachelor Degree",
        industry: "Retail", family_income: "$50k", heard_about_us: "Friend",
        driver_license_number: "TX123", driver_license_image_url: "p-1/1700000000000-id.jpg",
        paypal_username: "pat-pp", date_updated: "2026-10-05T00:00:00.000Z",
      };

      await actions.adminUpdateParticipant("p-1", formPayload);

      const expected = Object.keys(formPayload).filter((key) => key !== "email");
      expect(Object.keys(written()).sort()).toEqual(expected.sort());
    });

    it("refuses an ID photo outside this participant's folder, before reading or writing", async () => {
      // The form only sends a photo it has just uploaded to <userId>/.
      for (const path of ["p-2/123-id.jpg", "../p-2/x.jpg", "p-1/../p-2/x.jpg", "p-1/sub/x.jpg", "p-1/", "p-1/..", null, 42]) {
        await expect(
          actions.adminUpdateParticipant("p-1", { driver_license_image_url: path })
        ).rejects.toThrow("The ID photo must be in this participant's folder.");
      }
      expect(writes).toEqual([]);
      expect(reads).toEqual([]);
    });

    it("accepts a photo in the participant's folder whatever the case of the id in the URL", async () => {
      // The form builds the folder from the stored, lower-case user_id.
      await actions.adminUpdateParticipant("ABC-1", { driver_license_image_url: "abc-1/123-id.jpg" });
      expect(written().driver_license_image_url).toBe("abc-1/123-id.jpg");
    });
  });
});
