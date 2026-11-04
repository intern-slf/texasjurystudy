import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";

// ---------------------------------------------------------------------------
// The Zoom connection rule (ZOOM_CONNECTION_NOTICE in lib/mail.ts): a stable
// connection, camera and audio on, and removal after 15 minutes without one.
// It goes in the Zoom link email and in the invitation to an online session,
// so people see it before they accept. An in-person invitation leaves it out.
//
// The real templates and the real invite flow (lib/participant/invite.ts) run
// against an in-memory database; only the mailer request is intercepted, to
// read what would be sent.
// ---------------------------------------------------------------------------
process.env.MAILER_URL = "http://mailer.test";
process.env.MAILER_SHARED_SECRET = "mailer-test-secret";
process.env.EMAIL_ACTION_SECRET = "email-action-test-secret";

const RULE =
  "To participate in this Zoom session, you must have a stable Wi-Fi connection, and your camera " +
  "and audio must be turned on throughout. If you are unable to establish a reliable connection " +
  "within the first 15 minutes, you will be removed from the session to avoid disrupting the " +
  "presenters and other participants. You will then be considered for the next focus group.";

const db = new FakeDb();
const mode = vi.hoisted(() => ({ current: "online" as "online" | "offline" }));

vi.mock("@/lib/mailerAuth", () => ({ getMailerAuthToken: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => db.from(t) }) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: (t: string) => db.from(t) } }));
vi.mock("@/lib/case/getSessionDeliveryMode", () => ({
  getSessionDeliveryModeOrDefault: async () => mode.current,
}));
vi.mock("@/lib/participant/loginAccount", () => ({
  NO_LOGIN_REASON: "no login account",
  getIdsWithoutLogin: async () => new Set<string>(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sent: Array<{ to: string; subject: string; html: string }> = [];
const fetchMock = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
  sent.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: "msg-1", threadId: "thread-1" }), { status: 200 });
});

/** The words a reader sees: tags dropped (not spaced, so "connection</strong>," stays "connection,"). */
const words = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

let mail: typeof import("@/lib/mail");
let invite: typeof import("@/lib/participant/invite");
beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  mail = await import("@/lib/mail");
  invite = await import("@/lib/participant/invite");
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  sent.length = 0;
  db.reset({
    sessions: [{ id: "s-1", location: "500 Main St, Houston, TX 77002" }],
    jury_participants: [
      {
        user_id: "p-1",
        email: "pat@example.com",
        first_name: "Pat",
        last_name: "Lee",
        reactivation_status: "yes",
        blacklisted_at: null,
      },
    ],
  });
});

describe("the Zoom connection rule", () => {
  it("is the team's wording, word for word", () => {
    expect(words(mail.ZOOM_CONNECTION_NOTICE)).toBe(RULE);
  });

  it("is in the invitation to an online session", async () => {
    mode.current = "online";
    const result = await invite.inviteToSession("s-1", ["p-1"], "2026-11-12");

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/^Invitation: Texas Jury Study Session/);
    expect(words(sent[0].html)).toContain(RULE);
  });

  it("is not in the invitation to an in-person session", async () => {
    mode.current = "offline";
    const result = await invite.inviteToSession("s-1", ["p-1"], "2026-11-12");

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(words(sent[0].html)).toContain("This session is held in person");
    expect(words(sent[0].html)).not.toContain("stable Wi-Fi connection");
  });

  it("is still in the Zoom link email", async () => {
    await mail.sendZoomLinkEmail("pat@example.com", "Pat", "2026-11-12", "https://zoom.us/j/1", "6:00 PM CT");

    expect(sent).toHaveLength(1);
    expect(words(sent[0].html)).toContain(RULE);
  });
});
