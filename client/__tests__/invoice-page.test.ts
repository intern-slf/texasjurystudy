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
}));

vi.mock("next/navigation", () => ({
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

describe("invoice page", () => {
  const params = Promise.resolve({ caseId: CASE_ID });

  beforeEach(() => {
    mocks.user.current = { id: "firm-1" };
    mocks.role.current = "requestee";
    mocks.syncInvoice.mockReset();
    mocks.syncInvoice.mockResolvedValue(data());
  });

  async function render() {
    const { default: InvoicePage } = await import("@/app/invoice/[caseId]/page");
    return renderToStaticMarkup((await InvoicePage({ params })) as ReactElement);
  }

  it("shows the firm its own case's invoice, and names the PDF after its number", async () => {
    const html = await render();
    expect(html).toContain("INV-2026-0007");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("$1,700.00");
    expect(html).toContain("Amount due");
    expect(html).toContain("[print: Invoice INV-2026-0007 – Texas Jury Study]");
    expect(html).toContain(`/dashboard/requestee/${CASE_ID}`);
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
  });

  it("says void once voided", async () => {
    mocks.syncInvoice.mockResolvedValue(data({ voidedAt: heldSince }));
    const html = await render();
    expect(html).toContain("Void");
    expect(html).toContain("nothing is owed");
  });
});
