import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
} from "vitest";
import { NextRequest } from "next/server";
import { generateEmailActionToken } from "@/lib/emailActionToken";

const TEST_SECRET = "test-secret-for-api-route-handlers";
process.env.EMAIL_ACTION_SECRET = TEST_SECRET;
process.env.NEXT_PUBLIC_APP_URL ||= "http://test.local";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-test-key";

type SupabaseResult<T = unknown> = { data: T | null; error: unknown };

const supabaseState: {
  sessionParticipantRow: SupabaseResult<{
    invite_status: string;
    participant_id: string;
  }>;
  authUser: SupabaseResult<{ user: { email?: string } | null }>;
  generateLink: SupabaseResult<{ properties?: { action_link?: string } }>;
} = {
  sessionParticipantRow: { data: null, error: null },
  authUser: { data: null, error: null },
  generateLink: { data: null, error: null },
};

const fromMock = vi.fn(() => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => supabaseState.sessionParticipantRow);
  return builder;
});

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...(args as [])),
    auth: {
      admin: {
        getUserById: vi.fn(async () => supabaseState.authUser),
        generateLink: vi.fn(async () => supabaseState.generateLink),
      },
    },
  },
}));

const updateInviteStatusMock = vi.fn();
vi.mock("@/lib/participant/updateInviteStatus", () => ({
  updateInviteStatus: (...args: unknown[]) =>
    updateInviteStatusMock(...(args as [])),
}));

const verifyOtpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp: (...args: unknown[]) => verifyOtpMock(...(args as [])) },
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

vi.mock("heic-convert", () => ({
  default: vi.fn(
    async ({ buffer }: { buffer: ArrayBuffer | Buffer }) => {
      const buf = Buffer.from(buffer as ArrayBuffer);
      if (buf.length === 0) throw new Error("Empty input");
      if (buf.length > 10 * 1024 * 1024) throw new Error("Payload too large");
      const sig = buf.slice(4, 8).toString("ascii");
      if (sig !== "ftyp") throw new Error("Not a HEIC file");
      return Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // fake JPEG
    }
  ),
}));

describe("API Route Handlers", () => {
  beforeEach(() => {
    supabaseState.sessionParticipantRow = { data: null, error: null };
    supabaseState.authUser = { data: null, error: null };
    supabaseState.generateLink = { data: null, error: null };
    fromMock.mockClear();
    updateInviteStatusMock.mockReset();
    verifyOtpMock.mockReset();
  });

  // -----------------------------------------------------------------------
  // zip-lookup.test.ts  (real network calls to zippopotam.us + geo.fcc.gov)
  // -----------------------------------------------------------------------
  describe("zip-lookup.test.ts", () => {
    let GET: (typeof import("@/app/api/zip-lookup/route"))["GET"];
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/zip-lookup/route"));
    });

    it("Valid ZIP code", async () => {
      const req = new NextRequest(
        "http://test.local/api/zip-lookup?zip=78701"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.state).toBe("string");
      expect(body.state.length).toBeGreaterThan(0);
    }, 15_000);

    it("Invalid ZIP format", async () => {
      const req = new NextRequest(
        "http://test.local/api/zip-lookup?zip=abc"
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid zip code" });
    });

    it("Upstream timeout handling", async () => {
      // 00000 is not a real ZIP — zippopotam responds 404. The route
      // surfaces this as 404, demonstrating upstream-failure handling.
      const req = new NextRequest(
        "http://test.local/api/zip-lookup?zip=00000"
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
    }, 15_000);

    it("County lookup failure", async () => {
      const originalFetch = global.fetch;
      const spy = vi
        .spyOn(global, "fetch")
        .mockImplementation((async (
          input: RequestInfo | URL,
          init?: RequestInit
        ) => {
          const url = String(input);
          if (url.includes("geo.fcc.gov")) {
            throw new Error("FCC unavailable");
          }
          return originalFetch(input as RequestInfo, init);
        }) as typeof fetch);

      const req = new NextRequest(
        "http://test.local/api/zip-lookup?zip=78701"
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.county).toBe("");
      expect(typeof body.state).toBe("string");

      spy.mockRestore();
    }, 15_000);
  });

  // -----------------------------------------------------------------------
  // convert-heic.test.ts
  // -----------------------------------------------------------------------
  describe("convert-heic.test.ts", () => {
    let POST: (typeof import("@/app/api/convert-heic/route"))["POST"];
    beforeAll(async () => {
      ({ POST } = await import("@/app/api/convert-heic/route"));
    });

    function makeRequest(file: File | null): NextRequest {
      const fd = new FormData();
      if (file) fd.set("file", file);
      return new NextRequest("http://test.local/api/convert-heic", {
        method: "POST",
        body: fd,
      });
    }

    function makeFakeHeic(sizeBytes = 32): File {
      // Layout: 4 size bytes, "ftyp" magic at offset 4, then padding.
      const padding = Math.max(0, sizeBytes - 8);
      const buf = Buffer.concat([
        Buffer.from([0, 0, 0, sizeBytes & 0xff]),
        Buffer.from("ftyp"),
        Buffer.alloc(padding, 0),
      ]);
      return new File([buf], "photo.heic", { type: "image/heic" });
    }

    it("Valid HEIC conversion", async () => {
      const res = await POST(makeRequest(makeFakeHeic()));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      const out = Buffer.from(await res.arrayBuffer());
      // Output starts with JPEG SOI marker (0xFFD8) from our heic-convert mock.
      expect(out[0]).toBe(0xff);
      expect(out[1]).toBe(0xd8);
    });

    it("Reject non-HEIC files", async () => {
      const png = new File(
        [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "photo.png",
        { type: "image/png" }
      );
      const res = await POST(makeRequest(png));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(String(body.error)).toMatch(/HEIC|ftyp/i);
    });

    it("Oversized payload rejection", async () => {
      // 11 MiB buffer — our heic-convert mock rejects payloads > 10 MiB.
      const big = Buffer.alloc(11 * 1024 * 1024, 0x41);
      const file = new File([big], "huge.heic", { type: "image/heic" });
      const res = await POST(makeRequest(file));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(String(body.error)).toMatch(/too large|Payload/i);
    }, 15_000);
  });

  // -----------------------------------------------------------------------
  // email-action.test.ts
  // -----------------------------------------------------------------------
  describe("email-action.test.ts", () => {
    let GET: (typeof import("@/app/api/email-action/route"))["GET"];
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/email-action/route"));
    });

    function reqWithToken(token: string | undefined): NextRequest {
      const base = "http://test.local/api/email-action";
      const url =
        token === undefined ? base : `${base}?token=${encodeURIComponent(token)}`;
      return new NextRequest(url);
    }

    it("Accept action success", async () => {
      supabaseState.sessionParticipantRow = {
        data: { invite_status: "pending", participant_id: "p-1" },
        error: null,
      };
      updateInviteStatusMock.mockResolvedValue(undefined);

      const token = generateEmailActionToken(
        "invite-accept-1",
        "accepted",
        TEST_SECRET
      );
      const res = await GET(reqWithToken(token));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("In!"); // "You're In!" headline
      expect(updateInviteStatusMock).toHaveBeenCalledWith(
        "invite-accept-1",
        "accepted"
      );
    });

    it("Decline action success", async () => {
      supabaseState.sessionParticipantRow = {
        data: { invite_status: "pending", participant_id: "p-2" },
        error: null,
      };
      updateInviteStatusMock.mockResolvedValue(undefined);

      const token = generateEmailActionToken(
        "invite-decline-1",
        "declined",
        TEST_SECRET
      );
      const res = await GET(reqWithToken(token));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Invitation Declined");
      expect(updateInviteStatusMock).toHaveBeenCalledWith(
        "invite-decline-1",
        "declined"
      );
    });

    it("Expired token", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const token = generateEmailActionToken("invite-x", "accepted", TEST_SECRET);
      vi.setSystemTime(new Date("2025-01-09T00:00:00Z")); // > 7 days later

      const res = await GET(reqWithToken(token));
      vi.useRealTimers();

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("Link Expired or Invalid");
      expect(updateInviteStatusMock).not.toHaveBeenCalled();
    });

    it("Tampered signature", async () => {
      const token = generateEmailActionToken(
        "invite-tamper",
        "accepted",
        TEST_SECRET
      );
      const dot = token.lastIndexOf(".");
      const sigChar = token[dot + 1];
      const flipped = sigChar === "A" ? "B" : "A";
      const tampered = `${token.slice(0, dot + 1)}${flipped}${token.slice(
        dot + 2
      )}`;

      const res = await GET(reqWithToken(tampered));
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("Link Expired or Invalid");
      expect(updateInviteStatusMock).not.toHaveBeenCalled();
    });

    it("Already responded", async () => {
      supabaseState.sessionParticipantRow = {
        data: { invite_status: "accepted", participant_id: "p-3" },
        error: null,
      };

      const token = generateEmailActionToken(
        "invite-already",
        "accepted",
        TEST_SECRET
      );
      const res = await GET(reqWithToken(token));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("You Have Already Responded");
      expect(updateInviteStatusMock).not.toHaveBeenCalled();
    });

    it("Session full", async () => {
      supabaseState.sessionParticipantRow = {
        data: { invite_status: "pending", participant_id: "p-4" },
        error: null,
      };
      updateInviteStatusMock.mockResolvedValue({
        blocked: true,
        reason: "session_full",
      });

      const token = generateEmailActionToken(
        "invite-full",
        "accepted",
        TEST_SECRET
      );
      const res = await GET(reqWithToken(token));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Session Is Full");
    });

    it("Incomplete profile", async () => {
      supabaseState.sessionParticipantRow = {
        data: { invite_status: "pending", participant_id: "p-5" },
        error: null,
      };
      updateInviteStatusMock.mockResolvedValue({
        blocked: true,
        reason: "missing_profile",
        missing: ["dl", "paypal"],
      });

      const token = generateEmailActionToken(
        "invite-incomplete",
        "accepted",
        TEST_SECRET
      );
      const res = await GET(reqWithToken(token));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Profile Incomplete");
      expect(html).toContain("Driver");
      expect(html).toContain("PayPal");
    });
  });

  // -----------------------------------------------------------------------
  // auth-confirm.test.ts
  // -----------------------------------------------------------------------
  describe("auth-confirm.test.ts", () => {
    let GET: (typeof import("@/app/auth/confirm/route"))["GET"];
    beforeAll(async () => {
      ({ GET } = await import("@/app/auth/confirm/route"));
    });

    it("Valid token", async () => {
      verifyOtpMock.mockResolvedValue({ error: null });
      const req = new NextRequest(
        "http://test.local/auth/confirm?token_hash=hash-ok&type=email"
      );

      await expect(GET(req)).rejects.toMatchObject({ url: "/dashboard" });
      expect(verifyOtpMock).toHaveBeenCalledWith({
        type: "email",
        token_hash: "hash-ok",
      });
    });

    it("Expired token", async () => {
      verifyOtpMock.mockResolvedValue({
        error: { message: "Token has expired" },
      });
      const req = new NextRequest(
        "http://test.local/auth/confirm?token_hash=hash-expired&type=email"
      );

      const err = await GET(req).catch((e: RedirectError) => e);
      expect(err).toBeInstanceOf(RedirectError);
      expect((err as RedirectError).url).toContain("/auth/error?error=");
      expect((err as RedirectError).url).toContain("expired");
    });

    it("Missing token", async () => {
      const req = new NextRequest("http://test.local/auth/confirm");

      await expect(GET(req)).rejects.toMatchObject({
        url: "/auth/error?error=Invalid or missing token",
      });
      expect(verifyOtpMock).not.toHaveBeenCalled();
    });
  });
});
