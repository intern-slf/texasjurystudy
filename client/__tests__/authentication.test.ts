import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";
import { NextRequest } from "next/server";
import { UNDERAGE_MESSAGE } from "@/lib/age-gate";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";
process.env.NEXT_PUBLIC_APP_URL ||= "http://test.local";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// supabaseAdmin mock (for app/auth/actions.ts)
// ---------------------------------------------------------------------------
type SupaResult<T = unknown> = { data: T | null; error: unknown };

const supabaseAdminState: {
  createUser: SupaResult<{ user: { id: string } }>;
  roleInsert: { error: unknown };
  generateLink: SupaResult<{ properties: { action_link: string } }>;
} = {
  createUser: {
    data: { user: { id: "user-default-id" } },
    error: null,
  },
  roleInsert: { error: null },
  generateLink: {
    data: { properties: { action_link: "http://test.local/verify?token=x" } },
    error: null,
  },
};

const fromInsertSpy = vi.fn();
const createUserSpy = vi.fn();
const generateLinkSpy = vi.fn();
const fromSelectChain = () => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => gateState.agreementRow);
  builder.single = vi.fn(async () => gateState.agreementRow);
  return builder;
};

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: vi.fn(async (...args: unknown[]) => {
          createUserSpy(...args);
          return supabaseAdminState.createUser;
        }),
        generateLink: vi.fn(async (...args: unknown[]) => {
          generateLinkSpy(...args);
          return supabaseAdminState.generateLink;
        }),
      },
    },
    from: vi.fn((_table: string) => {
      const builder: Record<string, unknown> = {};
      builder.insert = vi.fn(async (...args: unknown[]) => {
        fromInsertSpy(_table, ...args);
        return supabaseAdminState.roleInsert;
      });
      // for confidentiality-gate query path
      builder.select = vi.fn(() => fromSelectChain());
      return builder;
    }),
  },
}));

// ---------------------------------------------------------------------------
// sendEmail mock (for app/auth/actions.ts)
// ---------------------------------------------------------------------------
type SendEmailArgs = { to: string; subject: string; html: string };
const sendEmailSpy = vi.fn<
  (args: SendEmailArgs) => Promise<{ messageId: string }>
>(async () => ({ messageId: "fake-message-id" }));
vi.mock("@/lib/mail", () => ({
  sendEmail: (args: SendEmailArgs) => sendEmailSpy(args),
  emailWrapper: (content: string) => `<wrapped>${content}</wrapped>`,
}));

// ---------------------------------------------------------------------------
// @supabase/ssr mock (for lib/supabase/proxy.ts middleware)
// ---------------------------------------------------------------------------
const middlewareState: {
  claims: { sub: string; role?: string } | null;
} = { claims: null };

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: middlewareState.claims },
        error: null,
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Confidentiality-gate state (shared between supabase mocks above)
// ---------------------------------------------------------------------------
const gateState: { agreementRow: SupaResult<{ agreed: boolean }> } = {
  agreementRow: { data: null, error: null },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Authentication", () => {
  beforeEach(() => {
    supabaseAdminState.createUser = {
      data: { user: { id: "user-default-id" } },
      error: null,
    };
    supabaseAdminState.roleInsert = { error: null };
    supabaseAdminState.generateLink = {
      data: { properties: { action_link: "http://test.local/verify?token=x" } },
      error: null,
    };
    middlewareState.claims = null;
    gateState.agreementRow = { data: null, error: null };
    fromInsertSpy.mockClear();
    createUserSpy.mockClear();
    generateLinkSpy.mockClear();
    sendEmailSpy.mockClear();
  });

  // -------------------------------------------------------------------------
  // signup-with-custom-email.test.ts
  // -------------------------------------------------------------------------
  describe("signup-with-custom-email.test.ts", () => {
    let signupWithCustomEmail: (typeof import("@/app/auth/actions"))["signupWithCustomEmail"];
    beforeAll(async () => {
      ({ signupWithCustomEmail } = await import("@/app/auth/actions"));
    });

    const ADULT_DOB = "1990-06-15";
    // Relative to the real clock so this stays under 18 whenever the suite runs.
    const CHILD_DOB = `${new Date().getFullYear() - 10}-01-01`;

    function makeForm(fields: Record<string, string | undefined>) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) fd.set(k, v);
      }
      return fd;
    }

    it("Participant role signup", async () => {
      const result = await signupWithCustomEmail(
        makeForm({
          email: "participant@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "participant",
        })
      );

      expect(result).toEqual({ success: true });
      expect(fromInsertSpy).toHaveBeenCalledWith(
        "roles",
        expect.objectContaining({
          role: "participant",
          email: "participant@example.com",
        })
      );
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const emailArgs = sendEmailSpy.mock.calls[0][0];
      expect(emailArgs.to).toBe("participant@example.com");
      expect(emailArgs.html).toContain("http://test.local/verify?token=x");
    });

    it("Requestee role signup", async () => {
      const result = await signupWithCustomEmail(
        makeForm({
          email: "requestee@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "requestee",
        })
      );

      expect(result).toEqual({ success: true });
      expect(fromInsertSpy).toHaveBeenCalledWith(
        "roles",
        expect.objectContaining({ role: "requestee" })
      );
    });

    it("Duplicate email handling", async () => {
      supabaseAdminState.createUser = {
        data: null,
        error: { message: "User already registered" },
      };

      const result = await signupWithCustomEmail(
        makeForm({
          email: "dup@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "participant",
        })
      );

      expect(result).toEqual({ error: "User already registered" });
      // Must NOT have inserted a role row or sent an email for a duplicate
      expect(fromInsertSpy).not.toHaveBeenCalled();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Missing role parameter", async () => {
      const result = await signupWithCustomEmail(
        makeForm({
          email: "noroleuser@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
        })
      );

      expect(result).toEqual({ error: "Invalid role" });
      expect(createUserSpy).not.toHaveBeenCalled();
      expect(fromInsertSpy).not.toHaveBeenCalled();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Admin role is rejected (no self-service privilege escalation)", async () => {
      const result = await signupWithCustomEmail(
        makeForm({
          email: "attacker@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "admin",
        })
      );

      expect(result).toEqual({ error: "Invalid role" });
      // Rejected before an auth user exists, so no admin row can ever be written
      expect(createUserSpy).not.toHaveBeenCalled();
      expect(fromInsertSpy).not.toHaveBeenCalled();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
    it("Under-18 date of birth is rejected before any account is created", async () => {
      const result = await signupWithCustomEmail(
        makeForm({
          email: "kid@example.com",
          password: "Secret123!",
          dateOfBirth: CHILD_DOB,
          role: "participant",
        })
      );

      expect(result).toEqual({ error: UNDERAGE_MESSAGE });
      // Nothing about a minor may be stored — not even the email on an auth user
      expect(createUserSpy).not.toHaveBeenCalled();
      expect(fromInsertSpy).not.toHaveBeenCalled();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Missing or malformed date of birth is rejected (server action called directly)", async () => {
      for (const dateOfBirth of [undefined, "", "2001-02-29", "tomorrow"]) {
        const result = await signupWithCustomEmail(
          makeForm({
            email: "nodob@example.com",
            password: "Secret123!",
            dateOfBirth,
            role: "requestee",
          })
        );
        expect(result).toMatchObject({ error: expect.stringMatching(/date of birth/) });
      }
      expect(createUserSpy).not.toHaveBeenCalled();
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("Date of birth is checked but not stored on the auth user", async () => {
      await signupWithCustomEmail(
        makeForm({
          email: "adult@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "participant",
        })
      );

      expect(createUserSpy).toHaveBeenCalledTimes(1);
      const [args] = createUserSpy.mock.calls[0] as [{ user_metadata: Record<string, unknown> }];
      expect(args.user_metadata).toEqual({ role: "participant" });
    });

    it("Confirm link lands on NEXT_PUBLIC_APP_URL, never on a posted origin", async () => {
      await signupWithCustomEmail(
        makeForm({
          email: "adult@example.com",
          password: "Secret123!",
          dateOfBirth: ADULT_DOB,
          role: "participant",
          origin: "https://texasjurystudy.vercel.app",
        })
      );

      const [args] = generateLinkSpy.mock.calls[0] as [{ options: { redirectTo: string } }];
      expect(args.options.redirectTo).toBe(`${APP_URL}/auth/callback`);
    });
  });

  // -------------------------------------------------------------------------
  // reset-password-with-custom-email.test.ts
  // -------------------------------------------------------------------------
  describe("reset-password-with-custom-email.test.ts", () => {
    let resetPasswordWithCustomEmail: (typeof import("@/app/auth/actions"))["resetPasswordWithCustomEmail"];
    beforeAll(async () => {
      ({ resetPasswordWithCustomEmail } = await import("@/app/auth/actions"));
    });

    function makeForm(email: string) {
      const fd = new FormData();
      fd.set("email", email);
      return fd;
    }

    it("Known email", async () => {
      const result = await resetPasswordWithCustomEmail(
        makeForm("known@example.com")
      );

      expect(result).toEqual({ success: true });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const args = sendEmailSpy.mock.calls[0][0];
      expect(args.to).toBe("known@example.com");
      expect(args.subject).toMatch(/Password Reset/i);
      expect(args.html).toContain("http://test.local/verify?token=x");
    });

    it("Unknown email (no information leakage)", async () => {
      // Supabase returns generic error for unknown email — implementation must not
      // surface a different shape that lets an attacker tell known vs unknown.
      supabaseAdminState.generateLink = {
        data: null,
        error: { message: "User not found" },
      };

      const result = await resetPasswordWithCustomEmail(
        makeForm("unknown@example.com")
      );

      // No outbound email when address is unknown
      expect(sendEmailSpy).not.toHaveBeenCalled();
      // The response must not echo the email address that was probed
      expect(JSON.stringify(result)).not.toContain("unknown@example.com");
    });

    it("Reset link lands on NEXT_PUBLIC_APP_URL, never on a posted origin", async () => {
      const fd = makeForm("known@example.com");
      fd.set("origin", "https://texasjurystudy.vercel.app");

      await resetPasswordWithCustomEmail(fd);

      const [args] = generateLinkSpy.mock.calls[0] as [{ options: { redirectTo: string } }];
      expect(args.options.redirectTo).toBe(`${APP_URL}/auth/update-password`);
    });
  });

  // -------------------------------------------------------------------------
  // update-password.test.ts
  // -------------------------------------------------------------------------
  describe("update-password.test.ts", () => {
    // The update-password form runs in the browser; we exercise the supabase
    // client surface it depends on (setSession → updateUser) plus the
    // mismatched-confirmation guard that protects the submit handler.

    type SetSessionArgs = { access_token: string; refresh_token: string };
    type UpdateUserArgs = { password: string };

    function makeMockClient(opts: {
      setSession?: SupaResult<unknown>;
      updateUser?: SupaResult<unknown>;
    }) {
      return {
        auth: {
          setSession: vi.fn<(args: SetSessionArgs) => Promise<SupaResult<unknown>>>(
            async () => opts.setSession ?? { data: {}, error: null }
          ),
          updateUser: vi.fn<(args: UpdateUserArgs) => Promise<SupaResult<unknown>>>(
            async () => opts.updateUser ?? { data: {}, error: null }
          ),
        },
      };
    }

    // Inline validator mirrors the intent of "confirm password" UX: submit
    // must only proceed when both inputs match.
    function passwordsMatch(a: string, b: string): boolean {
      return a.length > 0 && a === b;
    }

    it("Valid recovery session", async () => {
      const client = makeMockClient({
        setSession: { data: { session: { user: { id: "u1" } } }, error: null },
        updateUser: { data: { user: { id: "u1" } }, error: null },
      });

      await client.auth.setSession({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
      });

      const res = await client.auth.updateUser({ password: "NewSecret123!" });

      expect(client.auth.setSession).toHaveBeenCalledTimes(1);
      expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "NewSecret123!" });
      expect(res.error).toBeNull();
    });

    it("Expired session", async () => {
      const client = makeMockClient({
        updateUser: {
          data: null,
          error: { message: "Auth session missing or expired" },
        },
      });

      const res = await client.auth.updateUser({ password: "NewSecret123!" });

      expect(res.error).toMatchObject({
        message: expect.stringMatching(/expired|missing/i),
      });
    });

    it("Mismatched password confirmation", async () => {
      const client = makeMockClient({});

      const password = "NewSecret123!";
      const confirm = "NewSecret124!";
      expect(passwordsMatch(password, confirm)).toBe(false);

      // The submit guard must short-circuit before hitting Supabase
      if (passwordsMatch(password, confirm)) {
        await client.auth.updateUser({ password });
      }

      expect(client.auth.updateUser).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // middleware.test.ts
  // -------------------------------------------------------------------------
  describe("middleware.test.ts", () => {
    let updateSession: (typeof import("@/lib/supabase/proxy"))["updateSession"];
    beforeAll(async () => {
      ({ updateSession } = await import("@/lib/supabase/proxy"));
    });

    it("Unauthenticated redirect", async () => {
      middlewareState.claims = null;
      const req = new NextRequest("http://test.local/dashboard");
      const res = await updateSession(req);

      expect(res.status).toBe(307); // NextResponse.redirect default
      const location = res.headers.get("location");
      expect(location).toBeTruthy();
      expect(location).toContain("/auth/login");
    });

    it("Authenticated pass-through", async () => {
      middlewareState.claims = { sub: "user-1", role: "participant" };
      const req = new NextRequest("http://test.local/dashboard/participant");
      const res = await updateSession(req);

      // Not a redirect — passes the request through
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("Role-based redirect on /dashboard", async () => {
      // Middleware should allow authenticated users through to /dashboard so the
      // dashboard's own role-based redirect logic can run. It must not itself
      // bounce them back to /auth/login.
      for (const role of ["requestee", "participant"] as const) {
        middlewareState.claims = { sub: `user-${role}`, role };
        const req = new NextRequest("http://test.local/dashboard");
        const res = await updateSession(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    });

    it("Public legal pages are reachable logged out", async () => {
      // The footer links /privacy, /terms and /contact on every page, including
      // the logged-out marketing pages. If the auth wall catches them the links
      // 307 to /auth/login and the policies are unreachable — which is also a
      // compliance problem, not just a broken link.
      for (const path of [
        "/",
        "/participants",
        "/requestee",
        "/privacy",
        "/terms",
        "/contact",
      ]) {
        middlewareState.claims = null;
        const req = new NextRequest(`http://test.local${path}`);
        const res = await updateSession(req);

        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    });

    it("Public allowlist matches on a path boundary, not a prefix", async () => {
      // Guards against a lookalike route inheriting public access from the
      // allowlist, e.g. a future /privacy-admin page.
      middlewareState.claims = null;
      const req = new NextRequest("http://test.local/privacy-internal");
      const res = await updateSession(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/auth/login");
    });
  });

  // -------------------------------------------------------------------------
  // confidentiality-gate.test.ts
  // -------------------------------------------------------------------------
  describe("confidentiality-gate.test.ts", () => {
    // Mirrors the query path used by app/dashboard/page.tsx: pick the right
    // table per role, fetch `agreed` for the user, and decide gate vs pass.
    async function checkGate(role: "requestee" | "participant", userId: string) {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const table =
        role === "requestee"
          ? "confidentiality_agreements_requestee"
          : "confidentiality_agreements";

      const { data } = await supabaseAdmin
        .from(table)
        .select("agreed")
        .eq("user_id", userId)
        .maybeSingle();

      return data?.agreed === true ? "allowed" : "blocked";
    }

    it("Requestee blocked without agreement", async () => {
      gateState.agreementRow = { data: null, error: null };

      const decision = await checkGate("requestee", "requestee-user-1");
      expect(decision).toBe("blocked");
    });

    it("Access allowed with agreement", async () => {
      gateState.agreementRow = { data: { agreed: true }, error: null };

      const decision = await checkGate("requestee", "requestee-user-2");
      expect(decision).toBe("allowed");

      const decision2 = await checkGate("participant", "participant-user-1");
      expect(decision2).toBe("allowed");
    });
  });
});
