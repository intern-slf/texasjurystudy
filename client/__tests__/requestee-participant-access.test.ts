import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Law-firm (requestee) logins have no read access to jury_participants or
// oldData in the database (supabase/migrations/20261002_requestee_no_participant_access.sql).
// Everything a firm sees about a participant comes through
// lib/participant/requesteeAccess, so these tests pin what it lets through:
// only participants on the firm's own cases, and never contact, address, date
// of birth, ID or payment details.

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";

// ---------------------------------------------------------------------------
// One in-memory table store behind both clients. Filters that matter for access
// (eq, in, is, not in) are applied; or() is only recorded. Every table a client
// touches is logged per client, so a test can assert what was never read.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const reads: { admin: string[]; user: string[] } = { admin: [], user: [] };
const orCalls: string[] = [];
const session: { userId: string | null } = { userId: null };

function makeClient(who: "admin" | "user") {
  return {
    from(table: string) {
      reads[who].push(table);
      let rows = [...(db[table] ?? [])];
      let head = false;
      const builder: Record<string, unknown> = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          head = !!opts?.head;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        is: (col: string, val: unknown) => {
          rows = rows.filter((r) => (r[col] ?? null) === val);
          return builder;
        },
        not: (col: string, op: string, list: string) => {
          if (op === "in") {
            const ids = list.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
            rows = rows.filter((r) => !ids.includes(String(r[col])));
          }
          return builder;
        },
        or: (expr: string) => {
          orCalls.push(expr);
          return builder;
        },
        limit: (n: number) => {
          rows = rows.slice(0, n);
          return builder;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(head ? { count: rows.length, data: null, error: null } : { data: rows, error: null }),
      };
      return builder;
    },
    auth: {
      getUser: async () => ({ data: { user: session.userId ? { id: session.userId } : null } }),
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: makeClient("admin") }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient("user") }));
vi.mock("@/lib/case-lineage", () => ({ getBlockedParticipantIds: async () => [] }));
vi.mock("@/lib/participant/loginAccount", () => ({ getAllIdsWithoutLogin: async () => new Set<string>() }));

// Every column a firm must never receive, across both participant tables.
const PRIVATE_FIELDS = [
  "email",
  "phone",
  "street_address",
  "address_line_2",
  "zip_code",
  "county",
  "date_of_birth",
  "dob",
  "driver_license_number",
  "driver_license_image_url",
  "paypal_username",
  "blacklist_reason",
  "blacklisted_at",
  "availability_weekdays",
  "industry",
  "heard_about_us",
];

const pat = {
  id: "jp-1",
  user_id: "p-1",
  first_name: "Pat",
  last_name: "Lee",
  email: "pat@example.com",
  phone: "555-0100",
  street_address: "1 Main St",
  address_line_2: "Apt 2",
  zip_code: "77301",
  city: "Conroe",
  state: "TX",
  county: "Montgomery",
  date_of_birth: "1990-06-15",
  driver_license_number: "TX123",
  driver_license_image_url: "p-1/id.jpg",
  paypal_username: "pat-pp",
  gender: "Female",
  race: "White",
  political_affiliation: "Independent",
  blacklist_reason: null,
  blacklisted_at: null,
  approved_by_admin: true,
  reactivation_status: "yes",
  eligible_after_at: null,
  availability_weekdays: "Evenings",
  industry: "Retail",
  heard_about_us: "Friend",
};

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  reads.admin = [];
  reads.user = [];
  orCalls.length = 0;
  session.userId = "req-1";
  Object.assign(db, {
    roles: [
      { user_id: "req-1", role: "requestee" },
      { user_id: "req-2", role: "requestee" },
      { user_id: "admin-1", role: "admin" },
    ],
    cases: [
      { id: "case-1", user_id: "req-1", requestee_id: null },
      { id: "case-2", user_id: "admin-1", requestee_id: "req-1" },
      { id: "case-other", user_id: "req-2", requestee_id: null },
    ],
    session_cases: [
      { case_id: "case-1", session_id: "s-1" },
      { case_id: "case-other", session_id: "s-9" },
    ],
    session_participants: [
      { session_id: "s-1", participant_id: "p-1", invite_status: "accepted" },
      { session_id: "s-1", participant_id: "old-7", invite_status: "declined" },
      { session_id: "s-1", participant_id: "p-wait", invite_status: "waitlisted" },
      { session_id: "s-9", participant_id: "p-elsewhere", invite_status: "accepted" },
    ],
    jury_participants: [
      pat,
      { ...pat, id: "jp-2", user_id: "p-wait", first_name: "Wren" },
      { ...pat, id: "jp-3", user_id: "p-elsewhere", first_name: "Eli" },
    ],
    oldData: [
      { id: "old-7", first_name: "Olga", last_name: "Ruiz", email: "olga@example.com", phone: "555-0199", dob: "1980-01-02", age: 44 },
    ],
  });
});

describe("requestee participant access", () => {
  describe("the fields a firm may see", () => {
    let mod: typeof import("@/lib/participant/requesteeAccess");
    beforeAll(async () => {
      mod = await import("@/lib/participant/requesteeAccess");
    });

    it("keeps the profile fields and an age, and drops every private field", () => {
      const profile = mod.toRequesteeProfile(pat);
      expect(Object.keys(profile).sort()).toEqual([...mod.REQUESTEE_PROFILE_FIELDS, "age"].sort());
      for (const field of PRIVATE_FIELDS) expect(profile).not.toHaveProperty(field);
      expect(profile.first_name).toBe("Pat");
      expect(profile.city).toBe("Conroe");
    });

    it("works out the age from date_of_birth, oldData's dob, or its age column", () => {
      expect(mod.ageOf({ date_of_birth: "2000-01-01" })).toBe(mod.ageOf({ dob: "2000-01-01" }));
      expect(mod.ageOf({ age: 44 })).toBe(44);
      expect(mod.ageOf({ age: "52" })).toBe(52);
      expect(mod.ageOf({})).toBeNull();
      expect(mod.ageOf({ date_of_birth: "not a date" })).toBeNull();
    });

    it("search results carry an age, never the date of birth", () => {
      expect(mod.toRequesteeSearchResult(pat)).toEqual({
        id: "p-1",
        first_name: "Pat",
        last_name: "Lee",
        city: "Conroe",
        age: mod.ageOf(pat),
        political_affiliation: "Independent",
      });
    });
  });

  describe("getCaseParticipantNames", () => {
    let getCaseParticipantNames: (typeof import("@/lib/actions/requesteeParticipant"))["getCaseParticipantNames"];
    beforeAll(async () => {
      ({ getCaseParticipantNames } = await import("@/lib/actions/requesteeParticipant"));
    });

    it("returns names only, for people on the firm's own case, with legacy rows from oldData", async () => {
      const names = await getCaseParticipantNames(["case-1"], ["p-1", "old-7"]);
      expect(names).toEqual({
        "p-1": { first_name: "Pat", last_name: "Lee" },
        "old-7": { first_name: "Olga", last_name: "Ruiz" },
      });
    });

    it("leaves out anyone not on the case, and waitlisters", async () => {
      const names = await getCaseParticipantNames(["case-1"], ["p-1", "p-elsewhere", "p-wait"]);
      expect(Object.keys(names)).toEqual(["p-1"]);
    });

    it("refuses a case the firm doesn't own, before reading any participant table", async () => {
      await expect(getCaseParticipantNames(["case-1", "case-other"], ["p-elsewhere"])).rejects.toThrow(/not owned/);
      expect(reads.admin).not.toContain("jury_participants");
      expect(reads.admin).not.toContain("oldData");
    });

    it("accepts a case the firm is the assigned requestee on", async () => {
      await expect(getCaseParticipantNames(["case-2"], ["p-1"])).resolves.toEqual({});
    });

    it("doesn't depend on the roles table: a firm with no row there still gets names", async () => {
      db.roles = db.roles.filter((r) => r.user_id !== "req-1");
      const names = await getCaseParticipantNames(["case-1"], ["p-1"]);
      expect(names).toEqual({ "p-1": { first_name: "Pat", last_name: "Lee" } });
      expect(reads.admin).not.toContain("roles");
      expect(reads.user).not.toContain("roles");
    });

    it("refuses a signed-out caller", async () => {
      session.userId = null;
      await expect(getCaseParticipantNames(["case-1"], ["p-1"])).rejects.toThrow(/Unauthorized/);
    });

    it("returns nobody for a case with no session, such as one a participant created themselves", async () => {
      // cases' INSERT policies only check auth.uid() = user_id, so anyone can own
      // a case; only admins attach one to a session, and only people on its
      // sessions come back.
      session.userId = "p-1";
      db.cases.push({ id: "case-mine", user_id: "p-1", requestee_id: null });
      await expect(getCaseParticipantNames(["case-mine"], ["p-1", "old-7"])).resolves.toEqual({});
      expect(reads.admin).not.toContain("jury_participants");
      expect(reads.admin).not.toContain("oldData");
    });
  });

  describe("getParticipantProfile for a firm", () => {
    let getParticipantProfile: (typeof import("@/lib/participant/getParticipantProfile"))["getParticipantProfile"];
    beforeAll(async () => {
      ({ getParticipantProfile } = await import("@/lib/participant/getParticipantProfile"));
    });

    it("shows a participant on the firm's case, without any private field", async () => {
      const { participant, role } = await getParticipantProfile("p-1", { from: "case", caseId: "case-1" });
      expect(role).toBe("requestee");
      expect(participant?.first_name).toBe("Pat");
      for (const field of PRIVATE_FIELDS) expect(participant).not.toHaveProperty(field);
      // The firm's login never queries a participant table itself.
      expect(reads.user).not.toContain("jury_participants");
      expect(reads.user).not.toContain("oldData");
    });

    it("refuses a participant who isn't on that case, even with the firm's own case id", async () => {
      await expect(
        getParticipantProfile("p-elsewhere", { from: "case", caseId: "case-1" })
      ).rejects.toThrow("Access denied");
      expect(reads.admin).not.toContain("jury_participants");
    });

    it("refuses a case the firm doesn't own", async () => {
      await expect(
        getParticipantProfile("p-elsewhere", { from: "case", caseId: "case-other" })
      ).rejects.toThrow("Access denied");
    });

    it("refuses without a case", async () => {
      await expect(getParticipantProfile("p-1")).rejects.toThrow("Case context required");
    });
  });

  describe("searchParticipantsForCase", () => {
    let searchParticipantsForCase: (typeof import("@/lib/actions/requesteeParticipant"))["searchParticipantsForCase"];
    beforeAll(async () => {
      ({ searchParticipantsForCase } = await import("@/lib/actions/requesteeParticipant"));
    });

    it("returns only name, city, age and political affiliation", async () => {
      db.session_participants = [];
      const results = await searchParticipantsForCase("case-1", "pat");
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(Object.keys(r).sort()).toEqual(["age", "city", "first_name", "id", "last_name", "political_affiliation"]);
      }
      expect(reads.user).not.toContain("jury_participants");
    });

    it("strips characters that would add filters to the database query", async () => {
      await searchParticipantsForCase("case-1", "pat,email.ilike.*)(");
      expect(orCalls.filter((c) => c.startsWith("first_name"))).toEqual([
        "first_name.ilike.%patemail.ilike.%,last_name.ilike.%patemail.ilike.%",
      ]);
    });

    it("refuses a case the firm doesn't own", async () => {
      await expect(searchParticipantsForCase("case-other", "")).rejects.toThrow(/not owned/);
    });

    it("refuses a case with no session, such as one a participant created themselves", async () => {
      // cases' INSERT policies only check auth.uid() = user_id, so anyone can own
      // a case, and this search reads the whole panel with the service role. Only
      // admins attach a case to a session.
      session.userId = "p-1";
      db.cases.push({ id: "case-mine", user_id: "p-1", requestee_id: null });
      await expect(searchParticipantsForCase("case-mine", "")).rejects.toThrow(/No session/);
      expect(reads.admin).not.toContain("jury_participants");
      expect(reads.admin).not.toContain("oldData");
    });

    it("works for a firm with no row in the roles table", async () => {
      db.roles = db.roles.filter((r) => r.user_id !== "req-1");
      db.session_participants = [];
      const results = await searchParticipantsForCase("case-1", "pat");
      expect(results.map((r) => r.id)).toContain("p-1");
    });
  });

  describe("requesteeAddParticipants", () => {
    let requesteeAddParticipants: (typeof import("@/lib/actions/requesteeParticipant"))["requesteeAddParticipants"];
    beforeAll(async () => {
      ({ requesteeAddParticipants } = await import("@/lib/actions/requesteeParticipant"));
    });

    it("refuses a case with no session, such as one a participant created themselves", async () => {
      session.userId = "p-1";
      db.cases.push({ id: "case-mine", user_id: "p-1", requestee_id: null });
      await expect(requesteeAddParticipants("case-mine", ["p-elsewhere"])).rejects.toThrow(/No session/);
      expect(reads.user).not.toContain("session_participants");
    });
  });
});
