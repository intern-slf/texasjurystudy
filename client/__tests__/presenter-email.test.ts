import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PresenterCaseInfo, PresenterParticipantInfo } from "@/lib/mail";

// ---------------------------------------------------------------------------
// The presenter email (sendPresenterInfoEmail in lib/mail.ts) goes to whatever
// address the admin types, and almost everything in it comes from someone else:
// case titles, descriptions, file names and Drive links from the firm, the
// participants' own profile answers. These pin that every one of those is
// escaped, and that only an http(s) URL becomes a link (F28). The real mail.ts
// runs; only the mailer request is intercepted, to read the HTML it would send.
// ---------------------------------------------------------------------------
process.env.MAILER_URL = "http://mailer.test";
process.env.MAILER_SHARED_SECRET = "mailer-test-secret";

vi.mock("@/lib/mailerAuth", () => ({ getMailerAuthToken: async () => null }));

const sent: Array<{ to: string; subject: string; html: string }> = [];
const fetchMock = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
  sent.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: "msg-1", threadId: "thread-1" }), { status: 200 });
});

const ATTACK = '"><script>alert(1)</script>';

const caseWith = (overrides: Partial<PresenterCaseInfo>): PresenterCaseInfo => ({
  title: "Smith v. Jones",
  description: null,
  documents: [],
  driveUrls: [],
  ...overrides,
});

const participant: PresenterParticipantInfo = {
  first_name: `<b>Pat</b>`,
  last_name: ATTACK,
  email: `pat@example.com${ATTACK}`,
  city: ATTACK,
  county: ATTACK,
  gender: ATTACK,
  race: ATTACK,
  age: 41,
  marital_status: ATTACK,
  political_affiliation: ATTACK,
  education_level: ATTACK,
  currently_employed: ATTACK,
  family_income: ATTACK,
  served_on_jury: ATTACK,
  has_children: ATTACK,
};

describe("presenter email", () => {
  let sendPresenterInfoEmail: (typeof import("@/lib/mail"))["sendPresenterInfoEmail"];
  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    ({ sendPresenterInfoEmail } = await import("@/lib/mail"));
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    sent.length = 0;
    fetchMock.mockClear();
  });

  const html = () => {
    expect(sent).toHaveLength(1);
    return sent[0].html;
  };

  it("escapes the firm's title, description and file names, and the participants' answers", async () => {
    await sendPresenterInfoEmail(
      "presenter@example.com",
      "Tuesday, December 1, 2026",
      null,
      [
        caseWith({
          title: `<script>alert("title")</script>`,
          description: `<img src=x onerror=alert(1)>`,
          documents: [{ name: ATTACK, url: "https://storage.test/sign/doc.pdf?token=abc" }],
        }),
      ],
      [participant],
    );

    const body = html();
    expect(sent[0].to).toBe("presenter@example.com");
    expect(body).not.toContain("<script");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("<b>Pat</b>");
    expect(body).toContain("&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(body).toContain("&lt;b&gt;Pat&lt;/b&gt;");
    // Every participant field, the email included, is escaped the same way.
    expect(body.split("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;").length - 1).toBeGreaterThanOrEqual(13);
  });

  it("only links an http(s) Drive link, and escapes it so it can't leave its attribute", async () => {
    await sendPresenterInfoEmail("presenter@example.com", "Tuesday, December 1, 2026", null, [
      caseWith({
        driveUrls: [
          "https://drive.google.com/folders/abc?usp=sharing&x=1",
          'https://drive.google.com/x"><a href="https://evil.example">Sign in again</a>',
          "javascript:alert(document.cookie)",
          "data:text/html,<script>alert(1)</script>",
          "drive.google.com/no-scheme",
        ],
      }),
    ], []);

    const body = html();
    // A real link stays a link, its & escaped as HTML requires.
    expect(body).toContain('href="https://drive.google.com/folders/abc?usp=sharing&amp;x=1"');
    // A quote in the link can't close the href and open a link of its own.
    expect(body).not.toContain('<a href="https://evil.example">');
    expect(body).toContain("&quot;&gt;&lt;a href=&quot;https://evil.example&quot;&gt;");
    // Anything else is shown as text, never as a link.
    expect(body).not.toMatch(/href="(javascript|data):/i);
    expect(body).not.toContain('href="drive.google.com/no-scheme"');
    expect(body).toContain("javascript:alert(document.cookie)");
    expect(body).toContain("data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).toContain("drive.google.com/no-scheme");
    expect(body).not.toContain("<script");
  });

  it("only links an http(s) document or Zoom link", async () => {
    await sendPresenterInfoEmail(
      "presenter@example.com",
      "Tuesday, December 1, 2026",
      "https://zoom.us/j/123?pwd=a&b=c",
      [caseWith({ documents: [{ name: "brief.pdf", url: "javascript:alert(1)" }] })],
      [],
    );
    let body = html();
    expect(body).toContain('href="https://zoom.us/j/123?pwd=a&amp;b=c"');
    expect(body).not.toContain('href="javascript:');
    expect(body).toContain("brief.pdf");

    sent.length = 0;
    await sendPresenterInfoEmail("presenter@example.com", "Tuesday, December 1, 2026", 'javascript:alert("zoom")', [], []);
    body = html();
    expect(body).not.toContain('href="javascript:');
    expect(body).toContain("javascript:alert(&quot;zoom&quot;)");
  });
});
