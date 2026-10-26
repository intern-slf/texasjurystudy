import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoiceContent, invoiceView, type InvoiceRecord } from "@/lib/invoice";

/* ---------------------------------------------------------------------------
   An admin emailing a case's invoice to its firm (lib/actions/adminInvoice.ts),
   and what the email says (lib/invoiceEmail.ts). syncInvoice is tested in
   invoice.test.ts, and who may open the page in invoice-page.test.ts.
--------------------------------------------------------------------------- */

const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

const CASE_ID = "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b";
const slot = { starts_at: ct("2026-10-29", "09:00"), ends_at: ct("2026-10-29", "12:00") };
const heldSince = ct("2026-10-21", "15:00");

function data({
  title = "Smith v. Jones",
  email = "jane@firm.com" as string | null,
  paidAt = null as string | null,
  voidedAt = null as string | null,
} = {}) {
  const content = invoiceContent({
    theCase: {
      id: CASE_ID,
      title,
      filters: null,
      hours_requested: 2,
      delivery_mode: "online",
      admin_status: "approved",
      deleted_at: null,
      approved_at: null,
    },
    slot,
    sessionTime: null,
    firm: { name: "Jane Doe", email },
  });
  const record: InvoiceRecord = {
    id: "inv-1",
    invoice_number: "INV-2026-0007",
    case_id: CASE_ID,
    issued_at: heldSince,
    revised_at: null,
    voided_at: voidedAt,
    ...content,
  };
  return {
    invoice: invoiceView({
      record,
      booking: { held_since: heldSince, paid_at: paidAt },
      slot,
      nowMs: Date.parse(ct("2026-10-22", "09:00")),
    }),
    ownerIds: ["firm-1"],
  };
}

const mocks = vi.hoisted(() => ({
  isAdmin: { current: true },
  syncInvoice: vi.fn(),
  sendEmail: vi.fn<(opts: { to: string; subject: string; html: string }) => Promise<unknown>>(),
}));

vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: async () => {
    if (!mocks.isAdmin.current) throw new Error("Not authorized");
    return "admin-1";
  },
}));
vi.mock("@/lib/invoiceData", () => ({ syncInvoice: mocks.syncInvoice }));
vi.mock("@/lib/mail", async () => ({
  ...(await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail")),
  sendEmail: mocks.sendEmail,
}));

const { emailInvoice } = await import("@/lib/actions/adminInvoice");

describe("emailInvoice", () => {
  beforeEach(() => {
    mocks.isAdmin.current = true;
    mocks.syncInvoice.mockReset();
    mocks.syncInvoice.mockResolvedValue(data());
    mocks.sendEmail.mockReset();
    mocks.sendEmail.mockResolvedValue({ id: "m-1", threadId: "t-1" });
  });

  it("emails the invoice to the address it's billed to", async () => {
    expect(await emailInvoice(CASE_ID)).toEqual({ ok: true, sentTo: "jane@firm.com" });
    expect(mocks.syncInvoice).toHaveBeenCalledWith(CASE_ID);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const { to, subject, html } = mocks.sendEmail.mock.calls[0][0];
    expect(to).toBe("jane@firm.com");
    expect(subject).toBe("Invoice INV-2026-0007: Smith v. Jones | Texas Jury Study");
    expect(html).toContain("INV-2026-0007");
    expect(html).toContain("$1,700.00");
    expect(html).toContain("Amount due");
    expect(html).toContain("Unpaid");
    expect(html).toContain(`/invoice/${CASE_ID}`);
  });

  it("turns away anyone who isn't an admin before reading anything", async () => {
    mocks.isAdmin.current = false;
    await expect(emailInvoice(CASE_ID)).rejects.toThrow("Not authorized");
    expect(mocks.syncInvoice).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a case id that isn't one", async () => {
    expect(await emailInvoice("../etc")).toMatchObject({ ok: false });
    expect(mocks.syncInvoice).not.toHaveBeenCalled();
  });

  it("sends nothing when there's no case, no invoice yet, a void invoice, or no address", async () => {
    mocks.syncInvoice.mockResolvedValueOnce(null);
    expect(await emailInvoice(CASE_ID)).toEqual({ ok: false, error: "That case doesn't exist." });

    mocks.syncInvoice.mockResolvedValueOnce({ invoice: null, ownerIds: ["firm-1"] });
    expect(await emailInvoice(CASE_ID)).toMatchObject({ ok: false, error: expect.stringContaining("no invoice yet") });

    mocks.syncInvoice.mockResolvedValueOnce(data({ voidedAt: heldSince }));
    expect(await emailInvoice(CASE_ID)).toMatchObject({ ok: false, error: expect.stringContaining("void") });

    mocks.syncInvoice.mockResolvedValueOnce(data({ email: null }));
    expect(await emailInvoice(CASE_ID)).toMatchObject({ ok: false, error: expect.stringContaining("no email address") });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("tells the admin when the invoice can't be read or the email fails", async () => {
    mocks.syncInvoice.mockRejectedValueOnce(new Error("db down"));
    expect(await emailInvoice(CASE_ID)).toMatchObject({ ok: false, error: expect.stringContaining("Couldn't read") });

    mocks.sendEmail.mockRejectedValueOnce(new Error("mailer down"));
    expect(await emailInvoice(CASE_ID)).toEqual({
      ok: false,
      error: "The email to jane@firm.com failed. Try again in a minute.",
    });
  });

  it("says Total paid on a paid invoice, and escapes what the firm typed", async () => {
    mocks.syncInvoice.mockResolvedValue(data({ title: "<b>Doe</b> & Co", paidAt: ct("2026-10-21", "16:00") }));
    await emailInvoice(CASE_ID);
    const { html } = mocks.sendEmail.mock.calls[0][0];
    expect(html).toContain("Total paid");
    expect(html).toContain("paid in full");
    expect(html).not.toContain("<b>Doe</b>");
    expect(html).toContain("&lt;b&gt;Doe&lt;/b&gt; &amp; Co");
  });
});
