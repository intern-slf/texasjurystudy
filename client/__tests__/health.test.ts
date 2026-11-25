import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------------------------------------------------------------------------
   The uptime monitor's endpoint (app/api/health): 200 when the database and
   the mailer answer, 503 when either doesn't, and nothing but ok/fail in the
   body, since it's public.
--------------------------------------------------------------------------- */

const mocks = vi.hoisted(() => ({
  dbError: { current: null as { message: string } | null },
  dbThrows: { current: false },
  dbCalls: { current: 0 },
  token: vi.fn(async (): Promise<string | null> => "google-id-token"),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: async () => {
            mocks.dbCalls.current++;
            if (mocks.dbThrows.current) throw new Error("fetch failed");
            return { data: [], error: mocks.dbError.current };
          },
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/mailerAuth", () => ({ getMailerAuthToken: mocks.token }));

async function health() {
  // A fresh module each time, so its 30-second cache starts empty.
  vi.resetModules();
  const { GET } = await import("@/app/api/health/route");
  return GET();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(new Response("{}", { status: 200 }));
  mocks.token.mockResolvedValue("google-id-token");
  mocks.dbError.current = null;
  mocks.dbThrows.current = false;
  mocks.dbCalls.current = 0;
  process.env.MAILER_URL = "https://mailer.example.run.app/";
});

describe("GET /api/health", () => {
  it("answers 200 when the database and the mailer both answer", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checks: { database: "ok", mailer: "ok" } });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("asks the mailer through Cloud Run's IAM check, as every email does", async () => {
    await health();
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://mailer.example.run.app/health");
    expect(init.headers).toEqual({ Authorization: "Bearer google-id-token" });
  });

  it("answers 503 when the database can't be read, or can't be reached", async () => {
    mocks.dbError.current = { message: "permission denied" };
    let res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, checks: { database: "fail", mailer: "ok" } });

    mocks.dbError.current = null;
    mocks.dbThrows.current = true;
    res = await health();
    expect(res.status).toBe(503);
  });

  it("answers 503 when the mailer refuses, is down, or its token can't be had", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await health()).status).toBe(503);

    mocks.fetch.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));
    expect((await health()).status).toBe(503);

    mocks.token.mockRejectedValueOnce(new Error("STS exchange failed"));
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, checks: { database: "ok", mailer: "fail" } });
  });

  it("says why only in the logs, never in the public answer", async () => {
    mocks.dbError.current = { message: "relation secret_table does not exist" };
    const res = await health();
    expect(JSON.stringify(await res.json())).not.toContain("secret_table");
    expect(console.error).toHaveBeenCalled();
  });

  it("answers repeat calls from a short cache", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    await GET();
    await GET();
    await GET();
    expect(mocks.dbCalls.current).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
