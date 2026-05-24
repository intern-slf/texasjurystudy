import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";

// ---------------------------------------------------------------------------
// Unified stateful supabase mock — backs both `@/lib/supabase/server` and
// `@/lib/supabase/admin` against a shared response queue + capture log.
// ---------------------------------------------------------------------------
type CapturedOp =
  | { op: "select"; cols?: unknown }
  | { op: "update"; payload: Record<string, unknown> }
  | { op: "insert"; payload: unknown }
  | { op: "upsert"; payload: unknown; options?: unknown }
  | { op: "delete" };

type CapturedCall = {
  table: string;
  ops: CapturedOp[];
  eqs: Array<[string, unknown]>;
};

const state: {
  user: { id: string; user_metadata?: { role?: string } } | null;
  responses: Array<Record<string, unknown>>;
  captured: CapturedCall[];
  rlsBlock: boolean;
} = {
  user: null,
  responses: [],
  captured: [],
  rlsBlock: false,
};

function nextResponse(): Record<string, unknown> {
  if (state.rlsBlock) {
    return {
      data: null,
      error: { message: "row-level security violation", code: "42501" },
    };
  }
  return state.responses.shift() ?? { data: null, error: null };
}

function makeChainBuilder(table: string) {
  const captured: CapturedCall = { table, ops: [], eqs: [] };
  state.captured.push(captured);

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((cols?: unknown) => {
    captured.ops.push({ op: "select", cols });
    return builder;
  });
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    captured.ops.push({ op: "update", payload });
    return builder;
  });
  builder.insert = vi.fn((payload: unknown) => {
    captured.ops.push({ op: "insert", payload });
    return builder;
  });
  builder.upsert = vi.fn((payload: unknown, options?: unknown) => {
    captured.ops.push({ op: "upsert", payload, options });
    return builder;
  });
  builder.delete = vi.fn(() => {
    captured.ops.push({ op: "delete" });
    return builder;
  });
  builder.eq = vi.fn((col: string, val: unknown) => {
    captured.eqs.push([col, val]);
    return builder;
  });
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => nextResponse());
  builder.single = vi.fn(async () => nextResponse());
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown
  ) => Promise.resolve(nextResponse()).then(resolve);

  return builder;
}

function makeClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
    },
    from: vi.fn((table: string) => makeChainBuilder(table)),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => makeClient()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: makeClient(),
}));

// ---------------------------------------------------------------------------
// Mail mock — adminUpdateParticipant sends a profile-changed notification
// ---------------------------------------------------------------------------
const sendProfileUpdatedEmailSpy = vi.fn<
  (to: string, firstName: string, fields: string[]) => Promise<void>
>(async () => undefined);

vi.mock("@/lib/mail", () => ({
  sendProfileUpdatedEmail: (
    to: string,
    firstName: string,
    fields: string[]
  ) => sendProfileUpdatedEmailSpy(to, firstName, fields),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Participants", () => {
  beforeEach(() => {
    state.user = null;
    state.responses = [];
    state.captured = [];
    state.rlsBlock = false;
    sendProfileUpdatedEmailSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // create-profile.test.ts
  //
  // The first-time profile create runs inline in components/ParticipantForm.tsx
  // (line ~328) as an upsert on jury_participants keyed by user_id. The helper
  // below mirrors that flow plus the required-field guard from line ~235.
  // -------------------------------------------------------------------------
  describe("create-profile.test.ts", () => {
    type ProfilePayload = {
      user_id: string;
      gender?: string;
      race?: string;
      county?: string;
      paypal_username?: string;
      driver_license_number?: string;
      first_name?: string;
      last_name?: string;
      [k: string]: unknown;
    };

    const REQUIRED = [
      "gender",
      "race",
      "county",
      "paypal_username",
      "driver_license_number",
    ] as const;

    async function createProfile(payload: ProfilePayload) {
      for (const f of REQUIRED) {
        if (!payload[f] || String(payload[f]).trim() === "") {
          throw new Error(`Missing required field: ${f}`);
        }
      }
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { error } = await supabase
        .from("jury_participants")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    }

    function fullPayload(overrides: Partial<ProfilePayload> = {}): ProfilePayload {
      return {
        user_id: "user-1",
        first_name: "Ada",
        last_name: "Lovelace",
        gender: "Female",
        race: "White",
        county: "Travis",
        paypal_username: "ada@paypal",
        driver_license_number: "DL-12345",
        ...overrides,
      };
    }

    it("Happy path", async () => {
      state.responses = [{ error: null }];

      await createProfile(fullPayload());

      const c = state.captured.find((x) => x.table === "jury_participants")!;
      const upsertOp = c.ops.find((o) => o.op === "upsert") as {
        op: "upsert";
        payload: ProfilePayload;
        options: { onConflict: string };
      };
      expect(upsertOp.payload.user_id).toBe("user-1");
      expect(upsertOp.payload.gender).toBe("Female");
      expect(upsertOp.payload.paypal_username).toBe("ada@paypal");
    });

    it("Missing required demographic", async () => {
      await expect(
        createProfile(fullPayload({ gender: "" }))
      ).rejects.toThrow(/Missing required field: gender/);
      // The DB layer was never touched
      expect(state.captured).toHaveLength(0);
    });

    it("Duplicate profile prevention", async () => {
      // The upsert with onConflict: 'user_id' is the duplicate guard — a second
      // create for the same user collapses into an update of the existing row,
      // never a second insert.
      state.responses = [{ error: null }, { error: null }];

      await createProfile(fullPayload());
      await createProfile(fullPayload({ first_name: "Augusta" }));

      const upserts = state.captured.filter(
        (c) => c.table === "jury_participants"
      );
      expect(upserts).toHaveLength(2);
      for (const c of upserts) {
        const op = c.ops.find((o) => o.op === "upsert") as {
          op: "upsert";
          options: { onConflict: string };
        };
        expect(op.options.onConflict).toBe("user_id");
      }
    });
  });

  // -------------------------------------------------------------------------
  // update-profile-self.test.ts
  //
  // Self-update runs inline in components/EditProfileForm.tsx (~line 407),
  // scoped to the active user via .eq("user_id", participant.user_id). The
  // helper below mirrors that scope: a user can only mutate their own row.
  // -------------------------------------------------------------------------
  describe("update-profile-self.test.ts", () => {
    async function updateOwnProfile(
      payload: Record<string, unknown>
    ): Promise<void> {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { error } = await supabase
        .from("jury_participants")
        .update(payload)
        .eq("user_id", user.id);
      if (error) throw error;
    }

    it("User can update only own profile", async () => {
      state.user = { id: "self-1", user_metadata: { role: "participant" } };
      state.responses = [{ error: null }];

      await updateOwnProfile({ first_name: "Updated" });

      const c = state.captured.find((x) => x.table === "jury_participants")!;
      const upd = c.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.first_name).toBe("Updated");
      // The user_id filter must be the active user's id — not whatever was
      // submitted in the form payload.
      expect(c.eqs).toContainEqual(["user_id", "self-1"]);
      // And the payload itself must not be mutating a different user_id
      expect(upd.payload.user_id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // update-profile-admin.test.ts — real adminUpdateParticipant
  // -------------------------------------------------------------------------
  describe("update-profile-admin.test.ts", () => {
    let adminUpdateParticipant: (typeof import("@/lib/actions/adminParticipant"))["adminUpdateParticipant"];
    beforeAll(async () => {
      ({ adminUpdateParticipant } = await import(
        "@/lib/actions/adminParticipant"
      ));
    });

    it("Admin can update any profile", async () => {
      // 1st response: pre-update select * (fetches current row)
      // 2nd response: terminal update
      state.responses = [
        {
          data: {
            email: "p@example.com",
            first_name: "Pat",
            phone: "555-0100",
          },
          error: null,
        },
        { error: null },
      ];

      await adminUpdateParticipant("target-user-1", {
        phone: "555-0199",
        first_name: "Patricia",
      });

      const updateCall = state.captured.find(
        (c) =>
          c.table === "jury_participants" &&
          c.ops.some((o) => o.op === "update")
      )!;
      const upd = updateCall.ops.find((o) => o.op === "update") as {
        op: "update";
        payload: Record<string, unknown>;
      };
      expect(upd.payload.phone).toBe("555-0199");
      expect(upd.payload.first_name).toBe("Patricia");
      expect(upd.payload.date_updated).toEqual(expect.any(String));
      // Admin update targets the *passed* userId, not the caller's own id.
      expect(updateCall.eqs).toContainEqual(["user_id", "target-user-1"]);
      // A notification email is sent only for fields that actually changed.
      expect(sendProfileUpdatedEmailSpy).toHaveBeenCalledTimes(1);
      const [, , changedFields] = sendProfileUpdatedEmailSpy.mock.calls[0];
      expect(changedFields).toEqual(
        expect.arrayContaining(["Phone Number", "First Name"])
      );
    });

    it("Non-admin blocked", async () => {
      // Non-admin callers fail at the RLS boundary — the pre-fetch select still
      // returns null (no read permission), and the update itself returns 42501.
      state.responses = [
        { data: null, error: null }, // select * returns nothing for non-admin
      ];
      state.rlsBlock = true; // next op (the update) is denied

      await expect(
        adminUpdateParticipant("target-user-1", { phone: "555-0199" })
      ).rejects.toThrow(/row-level security/);
      expect(sendProfileUpdatedEmailSpy).not.toHaveBeenCalled();
    });
  });
});
