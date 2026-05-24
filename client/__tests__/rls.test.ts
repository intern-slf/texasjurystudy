import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// RLS policy simulator
//
// These tests do NOT exercise PostgreSQL RLS. They encode the policy intent
// in TypeScript so the access rules stay reviewable in code review alongside
// the SQL migrations in [supabase/migrations/](../../supabase/migrations/).
//
// REGRESSION GAP: if a migration changes a policy without the matching update
// here, these tests will still pass. The "live Postgres" integration test
// option captured in the conversation is the only way to close that gap; if
// you want it, the follow-up is a separate test file run under a Docker'd
// Supabase in CI.
// ---------------------------------------------------------------------------

type Role = "admin" | "requestee" | "participant" | "service_role";

type Caller = { id: string; role: Role };

type Denied = { denied: true; code: "42501"; reason: string };
type Allowed<T> = { denied: false; rows: T[] };
type Result<T> = Denied | Allowed<T>;

function deny(reason: string): Denied {
  return { denied: true, code: "42501", reason };
}
function allow<T>(rows: T[]): Allowed<T> {
  return { denied: false, rows };
}

// ---------------------------------------------------------------------------
// roles policy
//   - Only service_role (or DB superuser) can INSERT/UPDATE/DELETE.
//   - Any authenticated user can SELECT their own roles row.
// ---------------------------------------------------------------------------
type RolesRow = { user_id: string; role: Role; email: string };

function rolesUpdate(
  caller: Caller,
  target: { user_id: string; newRole: Role }
): Result<RolesRow> {
  if (caller.role === "service_role") {
    return allow([{ user_id: target.user_id, role: target.newRole, email: "" }]);
  }
  return deny("roles table is immutable from the client");
}

// ---------------------------------------------------------------------------
// cases policy
//   - admin: SELECT/INSERT/UPDATE/DELETE on every row.
//   - requestee: SELECT/INSERT/UPDATE/DELETE only where user_id = auth.uid().
//   - participant: no access.
// ---------------------------------------------------------------------------
type CaseRow = { id: string; user_id: string; title: string };

function casesSelect(caller: Caller, all: CaseRow[]): Result<CaseRow> {
  if (caller.role === "admin" || caller.role === "service_role")
    return allow(all);
  if (caller.role === "requestee")
    return allow(all.filter((c) => c.user_id === caller.id));
  if (caller.role === "participant") return allow([]);
  return deny("unknown role");
}

// ---------------------------------------------------------------------------
// case_documents policy — same partitioning as cases (visibility flows
// through case ownership).
// ---------------------------------------------------------------------------
type CaseDocRow = { id: string; case_id: string; uploaded_by: string };

function caseDocumentsSelect(
  caller: Caller,
  allCases: CaseRow[],
  allDocs: CaseDocRow[]
): Result<CaseDocRow> {
  const visibleCases = casesSelect(caller, allCases);
  if (visibleCases.denied) return visibleCases;
  const visibleCaseIds = new Set(visibleCases.rows.map((c) => c.id));
  return allow(allDocs.filter((d) => visibleCaseIds.has(d.case_id)));
}

// ---------------------------------------------------------------------------
// session_participants policy
//   - participant: only rows where participant_id = auth.uid().
//   - admin: all rows.
//   - requestee: rows for sessions tied to their own cases (out of scope here).
// ---------------------------------------------------------------------------
type SessionParticipantRow = {
  id: string;
  session_id: string;
  participant_id: string;
  invite_status: "pending" | "accepted" | "declined";
};

function sessionParticipantsSelect(
  caller: Caller,
  all: SessionParticipantRow[]
): Result<SessionParticipantRow> {
  if (caller.role === "admin" || caller.role === "service_role")
    return allow(all);
  if (caller.role === "participant")
    return allow(all.filter((r) => r.participant_id === caller.id));
  return allow([]);
}

// ---------------------------------------------------------------------------
// jury_participants policy
//   - participant: SELECT/UPDATE on own row (where user_id = auth.uid()).
//   - admin: full row access on every row.
//   - requestee: SELECT-only, restricted to a non-PII column projection so
//     they can build filters/audience without seeing personally identifying
//     information.
// ---------------------------------------------------------------------------
type JuryParticipantRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street_address: string;
  paypal_username: string;
  driver_license_number: string;
  // Non-PII demographic columns the requestee may see:
  gender: string;
  race: string;
  county: string;
  age_bracket: string;
  education_level: string;
  political_affiliation: string;
};

const REQUESTEE_VISIBLE_COLUMNS = [
  "gender",
  "race",
  "county",
  "age_bracket",
  "education_level",
  "political_affiliation",
] as const;
type RequesteeProjection = Pick<
  JuryParticipantRow,
  (typeof REQUESTEE_VISIBLE_COLUMNS)[number]
>;

function projectForRequestee(row: JuryParticipantRow): RequesteeProjection {
  const out = {} as RequesteeProjection;
  for (const col of REQUESTEE_VISIBLE_COLUMNS) {
    out[col] = row[col];
  }
  return out;
}

function juryParticipantsSelect(
  caller: Caller,
  all: JuryParticipantRow[]
): Result<JuryParticipantRow | RequesteeProjection> {
  if (caller.role === "admin" || caller.role === "service_role")
    return allow(all);
  if (caller.role === "participant")
    return allow(all.filter((r) => r.user_id === caller.id));
  if (caller.role === "requestee")
    return allow(all.map(projectForRequestee));
  return deny("unknown role");
}

// ---------------------------------------------------------------------------
// Seed data — the same fixture powers every describe below.
// ---------------------------------------------------------------------------
const cases: CaseRow[] = [
  { id: "case-A", user_id: "req-1", title: "Slip and fall" },
  { id: "case-B", user_id: "req-2", title: "Contract dispute" },
  { id: "case-C", user_id: "req-1", title: "Workplace injury" },
];

const caseDocs: CaseDocRow[] = [
  { id: "doc-1", case_id: "case-A", uploaded_by: "req-1" },
  { id: "doc-2", case_id: "case-B", uploaded_by: "req-2" },
  { id: "doc-3", case_id: "case-C", uploaded_by: "req-1" },
];

const sessionParticipants: SessionParticipantRow[] = [
  { id: "sp-1", session_id: "s-1", participant_id: "p-1", invite_status: "pending" },
  { id: "sp-2", session_id: "s-1", participant_id: "p-2", invite_status: "accepted" },
  { id: "sp-3", session_id: "s-2", participant_id: "p-1", invite_status: "declined" },
];

const juryParticipants: JuryParticipantRow[] = [
  {
    user_id: "p-1",
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    street_address: "1 Analytical Engine Ln",
    paypal_username: "ada-paypal",
    driver_license_number: "DL-0001",
    gender: "Female",
    race: "White",
    county: "Travis",
    age_bracket: "30-39",
    education_level: "Graduate Degree",
    political_affiliation: "Independent",
  },
  {
    user_id: "p-2",
    first_name: "Grace",
    last_name: "Hopper",
    email: "grace@example.com",
    phone: "555-0102",
    street_address: "1 Cobol Way",
    paypal_username: "grace-paypal",
    driver_license_number: "DL-0002",
    gender: "Female",
    race: "White",
    county: "Harris",
    age_bracket: "60+",
    education_level: "Graduate Degree",
    political_affiliation: "Democrat",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("RLS (Row Level Security)", () => {
  // -------------------------------------------------------------------------
  // rls-roles.test.ts
  // -------------------------------------------------------------------------
  describe("rls-roles.test.ts", () => {
    it("Roles immutable", () => {
      const callers: Caller[] = [
        { id: "u-1", role: "requestee" },
        { id: "u-2", role: "participant" },
        { id: "u-3", role: "admin" },
      ];
      for (const c of callers) {
        const result = rolesUpdate(c, { user_id: c.id, newRole: "admin" });
        expect(result.denied).toBe(true);
        expect((result as Denied).code).toBe("42501");
      }
      // Only service_role can mutate
      expect(
        rolesUpdate(
          { id: "svc", role: "service_role" },
          { user_id: "u-1", newRole: "admin" }
        ).denied
      ).toBe(false);
    });

    it("No self-promotion", () => {
      // A requestee attempting to UPDATE their own roles row to admin must be
      // denied — same policy as above, asserted at the self-promotion vector.
      const requestee: Caller = { id: "req-1", role: "requestee" };
      const result = rolesUpdate(requestee, {
        user_id: requestee.id,
        newRole: "admin",
      });
      expect(result.denied).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // rls-cases.test.ts
  // -------------------------------------------------------------------------
  describe("rls-cases.test.ts", () => {
    it("Requestee sees own cases only", () => {
      const result = casesSelect({ id: "req-1", role: "requestee" }, cases);
      expect(result.denied).toBe(false);
      const ids = (result as Allowed<CaseRow>).rows.map((r) => r.id);
      expect(ids).toEqual(["case-A", "case-C"]);
      expect(ids).not.toContain("case-B");
    });

    it("Participant sees none", () => {
      const result = casesSelect(
        { id: "p-1", role: "participant" },
        cases
      );
      expect(result.denied).toBe(false);
      expect((result as Allowed<CaseRow>).rows).toHaveLength(0);
    });

    it("Admin sees all", () => {
      const result = casesSelect({ id: "admin-1", role: "admin" }, cases);
      expect(result.denied).toBe(false);
      expect((result as Allowed<CaseRow>).rows).toHaveLength(cases.length);
    });
  });

  // -------------------------------------------------------------------------
  // rls-case-documents.test.ts
  // -------------------------------------------------------------------------
  describe("rls-case-documents.test.ts", () => {
    it("Same access partitioning as cases", () => {
      // Requestee: only docs for their own cases
      const reqRes = caseDocumentsSelect(
        { id: "req-1", role: "requestee" },
        cases,
        caseDocs
      );
      expect((reqRes as Allowed<CaseDocRow>).rows.map((d) => d.id)).toEqual([
        "doc-1",
        "doc-3",
      ]);

      // Participant: none
      const partRes = caseDocumentsSelect(
        { id: "p-1", role: "participant" },
        cases,
        caseDocs
      );
      expect((partRes as Allowed<CaseDocRow>).rows).toHaveLength(0);

      // Admin: all
      const adminRes = caseDocumentsSelect(
        { id: "admin-1", role: "admin" },
        cases,
        caseDocs
      );
      expect((adminRes as Allowed<CaseDocRow>).rows).toHaveLength(
        caseDocs.length
      );
    });
  });

  // -------------------------------------------------------------------------
  // rls-session-participants.test.ts
  // -------------------------------------------------------------------------
  describe("rls-session-participants.test.ts", () => {
    it("Participants see only their own invites", () => {
      const result = sessionParticipantsSelect(
        { id: "p-1", role: "participant" },
        sessionParticipants
      );
      expect(result.denied).toBe(false);
      const rows = (result as Allowed<SessionParticipantRow>).rows;
      expect(rows.map((r) => r.id)).toEqual(["sp-1", "sp-3"]);
      expect(rows.every((r) => r.participant_id === "p-1")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // rls-jury-participants.test.ts
  // -------------------------------------------------------------------------
  describe("rls-jury-participants.test.ts", () => {
    const PII_COLUMNS = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "street_address",
      "paypal_username",
      "driver_license_number",
    ];

    it("Participant sees own row", () => {
      const result = juryParticipantsSelect(
        { id: "p-1", role: "participant" },
        juryParticipants
      );
      expect(result.denied).toBe(false);
      const rows = (result as Allowed<JuryParticipantRow>).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe("p-1");
      // Participant viewing their own record sees their full PII
      expect(rows[0].email).toBe("ada@example.com");
    });

    it("Admin sees all", () => {
      const result = juryParticipantsSelect(
        { id: "admin-1", role: "admin" },
        juryParticipants
      );
      expect(result.denied).toBe(false);
      const rows = (result as Allowed<JuryParticipantRow>).rows;
      expect(rows).toHaveLength(juryParticipants.length);
      // Admin can see PII
      expect(rows.every((r) => typeof r.email === "string")).toBe(true);
    });

    it("Requestee gets filter-projected view only", () => {
      const result = juryParticipantsSelect(
        { id: "req-1", role: "requestee" },
        juryParticipants
      );
      expect(result.denied).toBe(false);
      const rows = (result as Allowed<RequesteeProjection>).rows;
      // Sees every row (audience-building) …
      expect(rows).toHaveLength(juryParticipants.length);
      // … but only the projected columns. No PII column may leak through.
      for (const row of rows) {
        for (const col of PII_COLUMNS) {
          expect(row).not.toHaveProperty(col);
        }
        // And the demographic columns are still present:
        expect(row).toHaveProperty("gender");
        expect(row).toHaveProperty("county");
        expect(row).toHaveProperty("age_bracket");
      }
    });
  });
});
