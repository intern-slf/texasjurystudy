import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Session dates and times in the emails (lib/mail.ts). The real templates run;
// only the mailer request is intercepted, to read what would be sent.
//
// The reschedule email gave only the new date, so a move to another time on
// the same day said "New Date: <the same date>" and left the time everyone had
// been sent uncorrected. And most participant emails printed the session date
// as stored, "2026-11-05", where the rest said "Thursday, November 5, 2026".
// ---------------------------------------------------------------------------
process.env.MAILER_URL = "http://mailer.test";
process.env.MAILER_SHARED_SECRET = "mailer-test-secret";

vi.mock("@/lib/mailerAuth", () => ({ getMailerAuthToken: async () => null }));

const sent: Array<{ to: string; subject: string; html: string }> = [];
const fetchMock = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
  sent.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: "msg-1", threadId: "thread-1" }), { status: 200 });
});

/** ICU puts a narrow no-break space before AM/PM; tags and spacing aside, the text. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

let mail: typeof import("@/lib/mail");
beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  mail = await import("@/lib/mail");
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  sent.length = 0;
});

describe("reschedule email", () => {
  it("gives a participant the new date and time, and needs nothing from them", async () => {
    await mail.sendRescheduleEmail("p@example.com", "2026-11-05", "participant", { timeStr: "2:00 PM – 3:00 PM CT" });

    const [email] = sent;
    expect(email.subject.replace(/\s/g, " ")).toBe(
      "Session Rescheduled – Thursday, November 5, 2026, 2:00 PM – 3:00 PM CT | Texas Jury Study",
    );
    const body = text(email.html);
    expect(body).toContain("New Session Date Thursday, November 5, 2026");
    expect(body).toContain("New Session Time 2:00 PM – 3:00 PM CT");
    expect(body).toContain("No action is required");
    expect(body).not.toContain("Your Case Time");
  });

  it("gives a firm each of its cases' times, escaped, and asks it to confirm", async () => {
    await mail.sendRescheduleEmail("firm@example.com", "Thursday, November 5, 2026", "requestee", {
      timeStr: "2:00 PM – 4:00 PM CT",
      caseTimes: [
        { title: "Smith v. Jones", time: "2:00 PM – 3:00 PM CT" },
        { title: "<script>alert(1)</script>", time: "3:00 PM – 4:00 PM CT" },
      ],
      askToConfirm: true,
    });

    const [email] = sent;
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;: 3:00 PM – 4:00 PM CT");
    const body = text(email.html);
    expect(body).toContain("New Session Date Thursday, November 5, 2026");
    expect(body).toContain("Your Case Times Smith v. Jones: 2:00 PM – 3:00 PM CT");
    // A reschedule resets the firm's confirmation, and its dashboard asks for one.
    expect(body).toContain("Please confirm the new time on your dashboard.");
    expect(body).not.toContain("No action is required");
  });

  it("gives one case's time on its own, and asks for nothing when there is nothing to confirm", async () => {
    // A case already on the Past tab, or whose new time has gone by, has no
    // Confirm button, so the firm isn't told to use one.
    await mail.sendRescheduleEmail("firm@example.com", "2026-11-05", "requestee", {
      caseTimes: [{ title: "Smith v. Jones", time: "2:00 PM – 3:00 PM CT" }],
    });

    const [email] = sent;
    expect(email.subject).toBe("Session Rescheduled – Thursday, November 5, 2026 | Texas Jury Study");
    const body = text(email.html);
    expect(body).toContain("Your Case Time 2:00 PM – 3:00 PM CT");
    expect(body).not.toContain("Smith v. Jones:");
    expect(body).not.toContain("New Session Time");
    expect(body).toContain("No action is required — your session details have been updated automatically.");
    expect(body).not.toContain("Please confirm");
  });
});

describe("case titles in the firm's session emails", () => {
  it("are escaped in Session Scheduled and Session Completed", async () => {
    const title = "<b>Smith</b> v. Jones";
    await mail.sendSessionCreatedEmail("firm@example.com", [title], "2026-11-05", "10:00 AM – 11:00 AM CT", ["10:00 AM – 11:00 AM CT"]);
    await mail.sendSessionCompletedEmail("firm@example.com", [title], "2026-11-05");

    for (const email of sent) {
      expect(email.html).not.toContain("<b>Smith</b>");
      expect(email.html).toContain("&lt;b&gt;Smith&lt;/b&gt; v. Jones");
    }
  });
});

describe("session dates in participant emails", () => {
  it("reads 'Thursday, November 5, 2026', in the subject and the body", async () => {
    await mail.sendZoomLinkEmail("p@example.com", "Pat", "2026-11-05", "https://zoom.us/j/1", "10:00 AM – 11:00 AM CT");
    await mail.sendInviteAcceptedConfirmationEmail("p@example.com", "2026-11-05", "10:00 AM – 11:00 AM CT");
    await mail.sendWaitlistCalledInEmail("p@example.com", "Pat", "2026-11-05", "$60.00", "$30.00");

    expect(sent.map((e) => e.subject)).toEqual([
      "Zoom Link for Your Session on Thursday, November 5, 2026 | Texas Jury Study",
      "Thank You for Accepting – Thursday, November 5, 2026 | Texas Jury Study",
      "You Were Called Into the Session on Thursday, November 5, 2026 | Texas Jury Study",
    ]);
    for (const email of sent) {
      expect(email.html).not.toContain("2026-11-05");
      expect(email.html).toContain("Thursday, November 5, 2026");
    }
  });

  it("leaves a date the caller already formatted as it is", async () => {
    await mail.sendSessionCompletedEmail("firm@example.com", ["Smith v. Jones"], "Thursday, November 5, 2026");
    expect(sent[0].html).toContain("Thursday, November 5, 2026");
  });
});
