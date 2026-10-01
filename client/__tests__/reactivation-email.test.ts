import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  generateReactivationToken,
  verifyReactivationToken,
  type ReactivationAction,
} from "@/lib/reactivationToken";

// The reactivation ("we have launched our new website — are you still
// interested?") campaign is commercial email under CAN-SPAM: every message
// must say it is a solicitation and carry a working unsubscribe link, plus the
// sender's postal address once MAILING_ADDRESS is set, and an opt-out must stop
// every later send. Unsubscribing sets reactivation_status to "no", the same as
// answering No, and the send skips "no". These tests pin each of those.

process.env.EMAIL_ACTION_SECRET ||= "test-secret-for-reactivation-email";
process.env.NEXT_PUBLIC_APP_URL ||= "http://test.local";
const SECRET = process.env.EMAIL_ACTION_SECRET;

// ---------------------------------------------------------------------------
// MAILING_ADDRESS is a module constant; a getter lets each test choose it.
// ---------------------------------------------------------------------------
const legal: { address: string | null } = { address: null };
vi.mock("@/lib/legal-constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/legal-constants")>()),
  get MAILING_ADDRESS() {
    return legal.address;
  },
}));

// ---------------------------------------------------------------------------
// Supabase: a chainable builder per from(). Every query is logged with its
// table, its verb (the first of select/update/upsert/delete) and its calls, and
// resolves through `db.resolve`, which each test can replace.
// ---------------------------------------------------------------------------
type Call = [method: string, ...args: unknown[]];
type Result = { data?: unknown; error: { message: string } | null };
type Query = { table: string; verb: string; calls: Call[] };

const VERBS = new Set(["select", "update", "upsert", "delete"]);
const defaultResolve = (_table: string, verb: string): Result =>
  verb === "select" ? { data: [], error: null } : { error: null };

const db: { queries: Query[]; resolve: (table: string, verb: string, calls: Call[]) => Result } = {
  queries: [],
  resolve: defaultResolve,
};

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const query: Query = { table, verb: "", calls: [] };
      db.queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "update", "upsert", "delete", "in", "eq", "neq", "is", "or", "order"]) {
        builder[method] = vi.fn((...args: unknown[]) => {
          query.calls.push([method, ...args]);
          if (!query.verb && VERBS.has(method)) query.verb = method;
          return builder;
        });
      }
      const settle = () => Promise.resolve(db.resolve(table, query.verb, query.calls));
      builder.single = vi.fn(settle);
      builder.maybeSingle = vi.fn(settle);
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        settle().then(resolve, reject);
      return builder;
    }),
  },
}));

const sendReactivationEmailMock = vi.fn(async (opts: unknown) => {
  void opts;
});
vi.mock("@/lib/mail", () => ({
  sendReactivationEmail: (opts: unknown) => sendReactivationEmailMock(opts),
  sendProfileUpdatedEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function queries(table: string, verb?: string): Query[] {
  return db.queries.filter((q) => q.table === table && (!verb || q.verb === verb));
}

function argsOf(query: Query | undefined, method: string): unknown[] | undefined {
  return query?.calls.find(([m]) => m === method)?.slice(1);
}

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

beforeEach(() => {
  legal.address = null;
  db.queries = [];
  db.resolve = defaultResolve;
  sendReactivationEmailMock.mockClear();
});

describe("reactivation email (CAN-SPAM)", () => {
  describe("unsubscribe token", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("round-trips the participant and the unsubscribe action", () => {
      const token = generateReactivationToken("p-1", "unsubscribe", SECRET);
      expect(verifyReactivationToken(token, SECRET)).toEqual({
        participantId: "p-1",
        action: "unsubscribe",
      });
    });

    it("keeps working well past the 30 days CAN-SPAM requires", () => {
      const token = generateReactivationToken("p-1", "unsubscribe", SECRET);
      vi.setSystemTime(new Date("2026-12-31T00:00:00Z"));
      expect(verifyReactivationToken(token, SECRET)?.action).toBe("unsubscribe");
    });

    it("leaves the Yes/No links on their 30-day expiry", () => {
      const token = generateReactivationToken("p-1", "yes", SECRET);
      vi.setSystemTime(new Date("2026-01-31T00:00:01Z"));
      expect(verifyReactivationToken(token, SECRET)).toBeNull();
    });
  });

  describe("emailWrapper footer", () => {
    let emailWrapper: (typeof import("@/lib/mail"))["emailWrapper"];
    beforeAll(async () => {
      ({ emailWrapper } = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail"));
    });

    it("labels campaign email a solicitation and links to unsubscribe", () => {
      const html = emailWrapper("<p>body</p>", { unsubscribeUrl: "http://test.local/u?token=abc" });
      expect(html).toContain("This is a solicitation from Texas Jury Study.");
      expect(html).toContain('href="http://test.local/u?token=abc"');
      expect(html).toContain("Unsubscribe");
    });

    it("adds neither to ordinary transactional email", () => {
      const html = emailWrapper("<p>body</p>");
      expect(html).not.toContain("Unsubscribe");
      expect(html).not.toContain("solicitation");
    });

    it("renders the postal address, escaped, once it is set", () => {
      legal.address = "100 Main St <Suite 2>, Houston, TX 77002";
      expect(emailWrapper("<p>body</p>")).toContain(
        "100 Main St &lt;Suite 2&gt;, Houston, TX 77002"
      );
    });
  });

  describe("sendReactivationEmails", () => {
    let sendReactivationEmails: (typeof import("@/lib/actions/adminParticipant"))["sendReactivationEmails"];
    beforeAll(async () => {
      ({ sendReactivationEmails } = await import("@/lib/actions/adminParticipant"));
    });

    type Row = { user_id: string; email: string | null; first_name: string | null; reactivation_email_sent_at: string | null };
    const row = (user_id: string, email: string): Row => ({
      user_id,
      email,
      first_name: "P",
      reactivation_email_sent_at: null,
    });

    function withRows(rows: Row[]) {
      db.resolve = (table, verb) =>
        table === "jury_participants" && verb === "select" ? { data: rows, error: null } : { error: null };
    }

    it("still sends while no postal address is set", async () => {
      withRows([row("p-1", "p1@example.com")]);

      const result = await sendReactivationEmails(["p-1"]);

      expect(result.sent).toBe(1);
      expect(sendReactivationEmailMock).toHaveBeenCalledTimes(1);
    });

    it("excludes anyone at 'no', whether they answered No or unsubscribed", async () => {
      await sendReactivationEmails(["p-1"]);

      expect(argsOf(queries("jury_participants", "select")[0], "or")).toEqual([
        "reactivation_status.is.null,reactivation_status.neq.no",
      ]);
    });

    it("gives every email an unsubscribe link signed for its recipient", async () => {
      withRows([row("p-1", "p1@example.com"), row("p-2", "p2@example.com")]);

      const result = await sendReactivationEmails(["p-1", "p-2"]);

      expect(result.sent).toBe(2);
      const sent = sendReactivationEmailMock.mock.calls.map(
        ([opts]) => opts as { to: string; unsubscribeUrl: string }
      );
      expect(sent.map((o) => [o.to, verifyReactivationToken(tokenFrom(o.unsubscribeUrl), SECRET)])).toEqual([
        ["p1@example.com", { participantId: "p-1", action: "unsubscribe" }],
        ["p2@example.com", { participantId: "p-2", action: "unsubscribe" }],
      ]);
    });
  });

  describe("reactivate route", () => {
    let GET: (typeof import("@/app/api/email-action/reactivate/route"))["GET"];
    let POST: (typeof import("@/app/api/email-action/reactivate/route"))["POST"];
    beforeAll(async () => {
      ({ GET, POST } = await import("@/app/api/email-action/reactivate/route"));
    });

    const URL_BASE = "http://test.local/api/email-action/reactivate";
    const tokenFor = (action: ReactivationAction, participantId = "p-1") =>
      generateReactivationToken(participantId, action, SECRET);

    function click(action: ReactivationAction) {
      return GET(new NextRequest(`${URL_BASE}?token=${encodeURIComponent(tokenFor(action))}`));
    }

    function press(token: string) {
      return POST(
        new NextRequest(URL_BASE, {
          method: "POST",
          body: new URLSearchParams({ token }),
        })
      );
    }

    // The participant row the route reads, and an optional failing table.
    function withParticipant(
      row: { reactivation_status: string } | null,
      failing?: { table: string; verb: string }
    ) {
      db.resolve = (table, verb) => {
        if (failing && table === failing.table && verb === failing.verb) {
          return { data: null, error: { message: "boom" } };
        }
        if (table === "jury_participants" && verb === "select") {
          return {
            data: row && { user_id: "p-1", paypal_username: "pp", driver_license_number: "1", driver_license_image_url: "x", ...row },
            error: null,
          };
        }
        return { error: null };
      };
    }

    const participantUpdates = () => queries("jury_participants", "update").map((q) => q.calls);

    describe("Unsubscribe", () => {
      it("opening the link only shows the button and writes nothing", async () => {
        const res = await click("unsubscribe");

        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain('method="post"');
        expect(body).toContain(">Unsubscribe</button>");
        // A scanner following the link must not be able to take anyone off the panel.
        expect(db.queries).toEqual([]);
      });

      it("the button sets reactivation_status to no, whatever it was", async () => {
        const res = await press(tokenFor("unsubscribe"));

        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain("You have been unsubscribed");
        // Seats they already accepted stay booked, so the page must not claim otherwise.
        expect(body).toContain("already accepted are not cancelled");
        expect(participantUpdates()).toEqual([
          [
            ["update", { reactivation_status: "no", reactivation_confirmed_at: expect.any(String) }],
            ["eq", "user_id", "p-1"],
            ["neq", "reactivation_status", "no"],
          ],
        ]);
      });

      it("names the support address if the write fails", async () => {
        withParticipant(null, { table: "jury_participants", verb: "update" });

        const res = await press(tokenFor("unsubscribe"));

        expect(res.status).toBe(500);
        expect(await res.text()).toContain("info@texasjurystudy.com");
      });

      it("the button refuses a token from any other link", async () => {
        for (const action of ["yes", "no", "edit"] as const) {
          const res = await press(tokenFor(action));
          expect(res.status).toBe(400);
        }
        expect(participantUpdates()).toEqual([]);
      });

      it("the button refuses a tampered token", async () => {
        const res = await press(`${tokenFor("unsubscribe")}x`);

        expect(res.status).toBe(400);
        expect(await res.text()).toContain("Link Expired or Invalid");
        expect(participantUpdates()).toEqual([]);
      });
    });

    describe("No click", () => {
      it("takes a pending participant off the panel", async () => {
        withParticipant({ reactivation_status: "pending" });

        const res = await click("no");

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("removed from active invitations");
        expect(participantUpdates()).toEqual([
          [
            ["update", { reactivation_status: "no", reactivation_confirmed_at: expect.any(String) }],
            ["eq", "user_id", "p-1"],
            ["eq", "reactivation_status", "pending"],
          ],
        ]);
      });

      it("never overwrites an earlier answer", async () => {
        withParticipant({ reactivation_status: "yes" });

        const res = await click("no");

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("We already had your response on file");
        expect(participantUpdates()).toEqual([]);
      });
    });
  });
});
