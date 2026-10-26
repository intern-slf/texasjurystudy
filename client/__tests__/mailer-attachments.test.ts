import { describe, it, expect, beforeAll } from "vitest";

/* ---------------------------------------------------------------------------
   Attachments in the mailer's MIME (mailer/server.js buildRawMessage): an
   email with files becomes multipart/mixed, with each file base64 encoded
   whole, and one without stays the single HTML part it always was.
--------------------------------------------------------------------------- */

type Built = (opts: {
  to: string;
  subject: string;
  html: string;
  messageId?: string | null;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}) => string;

let buildRawMessage: Built;

beforeAll(async () => {
  // server.js reads these at import, and only listens when not import-only.
  process.env.MAILER_IMPORT_ONLY = "1";
  process.env.IMPERSONATE_USER = "intern@texasjurystudy.com";
  process.env.MAILER_SHARED_SECRET = "test-secret";
  ({ buildRawMessage } = (await import("../../mailer/server.js")) as { buildRawMessage: Built });
});

const decode = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

describe("mailer attachments", () => {
  it("sends a file as a multipart/mixed part, its bytes intact", () => {
    const file = Buffer.from("%PDF-1.7\n...binary \u0000ÿ...\n%%EOF");
    const mime = decode(
      buildRawMessage({
        to: "jane@firm.com",
        subject: "Invoice INV-2026-0007",
        html: "<p>Here it is</p>",
        attachments: [
          { filename: "Invoice INV-2026-0007 - Texas Jury Study.pdf", contentType: "application/pdf", contentBase64: file.toString("base64") },
        ],
      })
    );

    const boundary = mime.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/)?.[1];
    expect(boundary).toBeTruthy();
    const parts = mime.split(`--${boundary}`);
    // preamble, html, file, closing "--"
    expect(parts).toHaveLength(4);
    expect(parts[3].trim()).toBe("--");

    expect(parts[1]).toContain('Content-Type: text/html; charset="UTF-8"');
    const [htmlHead, htmlBody] = parts[1].split("\r\n\r\n");
    expect(htmlHead).toContain("Content-Transfer-Encoding: base64");
    expect(Buffer.from(htmlBody.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("<p>Here it is</p>");

    const [fileHead, fileBody] = parts[2].split("\r\n\r\n");
    expect(fileHead).toContain('Content-Disposition: attachment; filename="Invoice INV-2026-0007 - Texas Jury Study.pdf"');
    expect(fileHead).toContain("Content-Type: application/pdf");
    expect(fileBody.split("\r\n").every((line) => line.length <= 76)).toBe(true);
    expect(Buffer.from(fileBody.replace(/\r\n/g, ""), "base64").equals(file)).toBe(true);
  });

  it("keeps an email without files as a single HTML part", () => {
    const mime = decode(buildRawMessage({ to: "jane@firm.com", subject: "Hi", html: "<p>x</p>" }));
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).not.toContain("multipart");
  });
});
