import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { invoiceContent, invoiceView, type InvoiceRecord } from "@/lib/invoice";

/* ---------------------------------------------------------------------------
   Who can open an invoice (app/invoice/[caseId]), and what it shows. The page
   reads with the service role, so it must check the caller itself: an admin
   sees any case, a firm only its own. syncInvoice is tested in invoice.test.ts.
--------------------------------------------------------------------------- */

const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

const CASE_ID = "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b";
const slot = { starts_at: ct("2026-10-29", "09:00"), ends_at: ct("2026-10-29", "12:00") };
const heldSince = ct("2026-10-21", "15:00");

const content = invoiceContent({
  theCase: {
    id: CASE_ID,
    title: "Smith v. Jones",
    filters: null,
    hours_requested: 2,
    delivery_mode: "online",
    admin_status: "approved",
    deleted_at: null,
    approved_at: null,
  },
  slot,
  sessionTime: null,
  firm: { name: "Jane Doe", email: "jane@firm.com" },
});
const record = (overrides: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  id: "inv-1",
  invoice_number: "INV-2026-0007",
  case_id: CASE_ID,
  issued_at: heldSince,
  revised_at: null,
  voided_at: null,
  ...content,
  ...overrides,
});

function data({ paidAt = null as string | null, voidedAt = null as string | null, ownerIds = ["firm-1"] } = {}) {
  return {
    invoice: invoiceView({
      record: record({ voided_at: voidedAt }),
      booking: { held_since: heldSince, paid_at: paidAt },
      slot,
      nowMs: Date.parse(ct("2026-10-22", "09:00")),
    }),
    ownerIds,
  };
}

class RedirectError extends Error {}
class NotFoundError extends Error {}

const mocks = vi.hoisted(() => ({
  user: { current: null as { id: string } | null },
  role: { current: null as string | null },
  syncInvoice: vi.fn(),
  payOnline: { current: false },
  payments: { current: [] as Record<string, unknown>[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new NotFoundError("not found");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user.current } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.role.current ? { role: mocks.role.current } : null }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/invoiceData", () => ({ syncInvoice: mocks.syncInvoice }));
vi.mock("@/components/PrintInvoiceButton", () => ({
  default: ({ fileName }: { fileName: string }) => `[print: ${fileName}]`,
}));
vi.mock("@/components/EmailInvoiceButton", () => ({
  default: ({ to }: { to: string }) => `[email to: ${to}]`,
}));
vi.mock("@/components/PayInvoiceButton", () => ({
  default: ({ amountLabel }: { amountLabel: string }) => `[pay: ${amountLabel}]`,
}));
vi.mock("@/lib/stripe", () => ({ onlinePaymentEnabled: () => mocks.payOnline.current }));
vi.mock("@/lib/invoicePaymentData", () => ({ getInvoicePayments: async () => mocks.payments.current }));

describe("invoice page", () => {
  const params = Promise.resolve({ caseId: CASE_ID });

  beforeEach(() => {
    mocks.user.current = { id: "firm-1" };
    mocks.role.current = "requestee";
    mocks.syncInvoice.mockReset();
    mocks.syncInvoice.mockResolvedValue(data());
    mocks.payOnline.current = false;
    mocks.payments.current = [];
  });

  async function render(payment?: string) {
    const { default: InvoicePage } = await import("@/app/invoice/[caseId]/page");
    const searchParams = Promise.resolve(payment ? { payment } : {});
    return renderToStaticMarkup((await InvoicePage({ params, searchParams })) as ReactElement);
  }

  it("shows the firm its own case's invoice, and names the PDF after its number", async () => {
    const html = await render();
    expect(html).toContain("INV-2026-0007");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("$1,700.00");
    expect(html).toContain("Amount due");
    expect(html).toContain("[print: Invoice INV-2026-0007 – Texas Jury Study]");
    expect(html).toContain(`/dashboard/requestee/${CASE_ID}`);
    expect(html).toContain("Please make checks payable to:");
    expect(html).toContain("402 Simonton St");
  });

  it("hides another firm's case as if it didn't exist", async () => {
    mocks.syncInvoice.mockResolvedValue(data({ ownerIds: ["firm-2"] }));
    await expect(render()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows an admin any case, linking back to the admin's case page", async () => {
    mocks.user.current = { id: "admin-1" };
    mocks.role.current = "admin";
    mocks.syncInvoice.mockResolvedValue(data({ ownerIds: ["firm-2"] }));
    expect(await render()).toContain(`/dashboard/Admin/${CASE_ID}`);
  });

  it("offers an admin, and only an admin, to email the invoice to the firm", async () => {
    expect(await render()).not.toContain("[email to:");
    mocks.user.current = { id: "admin-1" };
    mocks.role.current = "admin";
    expect(await render()).toContain("[email to: jane@firm.com]");
  });

  it("doesn't offer to email a void invoice", async () => {
    mocks.user.current = { id: "admin-1" };
    mocks.role.current = "admin";
    mocks.syncInvoice.mockResolvedValue(data({ voidedAt: heldSince }));
    expect(await render()).not.toContain("[email to:");
  });

  it("turns away participants and signed-out visitors before reading anything", async () => {
    mocks.role.current = "participant";
    await expect(render()).rejects.toThrow("/dashboard");
    mocks.user.current = null;
    await expect(render()).rejects.toThrow("/auth/login");
    expect(mocks.syncInvoice).not.toHaveBeenCalled();
  });

  it("says when there's no invoice yet", async () => {
    mocks.syncInvoice.mockResolvedValue({ invoice: null, ownerIds: ["firm-1"] });
    expect(await render()).toContain("No invoice yet");
  });

  it("says Total paid once paid", async () => {
    mocks.syncInvoice.mockResolvedValue(data({ paidAt: ct("2026-10-21", "16:00") }));
    const html = await render();
    expect(html).toContain("Total paid");
    expect(html).toContain("paid in full");
    expect(html).not.toContain("checks payable");
  });

  it("says void once voided", async () => {
    mocks.syncInvoice.mockResolvedValue(data({ voidedAt: heldSince }));
    const html = await render();
    expect(html).toContain("Void");
    expect(html).toContain("nothing is owed");
    expect(html).not.toContain("checks payable");
  });

  describe("paying online", () => {
    beforeEach(() => {
      mocks.payOnline.current = true;
    });

    it("offers the firm, and only the firm, to pay an owed invoice", async () => {
      expect(await render()).toContain("[pay: $1,700.00]");
      mocks.role.current = "admin";
      expect(await render()).not.toContain("[pay:");
    });

    it("doesn't offer it until Stripe is set up", async () => {
      mocks.payOnline.current = false;
      expect(await render()).not.toContain("[pay:");
    });

    it("doesn't offer it once paid or void", async () => {
      mocks.syncInvoice.mockResolvedValue(data({ paidAt: ct("2026-10-21", "16:00") }));
      expect(await render()).not.toContain("[pay:");
      mocks.syncInvoice.mockResolvedValue(data({ voidedAt: heldSince }));
      expect(await render()).not.toContain("[pay:");
    });

    it("says a bank payment is on its way instead of offering another", async () => {
      mocks.payments.current = [{ status: "processing" }];
      const html = await render();
      expect(html).not.toContain("[pay:");
      expect(html).toContain("bank payment for this invoice is on its way");
    });

    it("says what happened when Stripe sends the firm back", async () => {
      expect(await render("cancelled")).toContain("Nothing was charged");
      expect(await render("done")).toContain("recording your payment");
      mocks.syncInvoice.mockResolvedValue(data({ paidAt: ct("2026-10-21", "16:00") }));
      expect(await render("done")).toContain("your payment was received");
    });

    it("says what a paid invoice was paid with, even with online payment off", async () => {
      mocks.syncInvoice.mockResolvedValue(data({ paidAt: ct("2026-10-21", "16:00") }));
      mocks.payments.current = [{ status: "succeeded", method_type: "card", method_brand: "visa", method_last4: "4242" }];
      expect(await render()).toContain("Visa ending in 4242");
      mocks.payOnline.current = false;
      expect(await render()).toContain("Visa ending in 4242");
    });

    it("says nothing about a method on a paid invoice marked paid by hand", async () => {
      mocks.syncInvoice.mockResolvedValue(data({ paidAt: ct("2026-10-21", "16:00") }));
      expect(await render()).not.toContain("ending in");
    });
  });
});
