import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { buildInvoice, invoiceNumber, type InvoiceCase } from "@/lib/invoice";
import { calculateReceiptPrice } from "@/lib/receipt-pricing";
import { paymentDueAt } from "@/lib/slotBooking";
import type { CaseFilters } from "@/lib/filter-utils";

// October 2026 is Central Daylight Time (UTC-5).
const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

const CASE_ID = "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b";

function aCase(overrides: Partial<InvoiceCase> = {}): InvoiceCase {
  return {
    id: CASE_ID,
    title: "Smith v. Jones",
    filters: null,
    hours_requested: 2,
    delivery_mode: "online",
    approved_at: ct("2026-10-20", "10:00"),
    created_at: ct("2026-10-19", "10:00"),
    ...overrides,
  };
}

const slot = { starts_at: ct("2026-10-29", "09:00"), ends_at: ct("2026-10-29", "12:00") };
const heldSince = ct("2026-10-21", "15:00"); // Wed 3 PM: due Thu 3 PM
const firm = { name: "Jane Doe", email: "jane@firm.com" };

function invoiceFor({
  theCase = aCase(),
  booking = { held_since: heldSince, paid_at: null } as { held_since: string | null; paid_at: string | null } | null,
  withSlot = true,
  sessionTime = null as { sessionDate: string; time: string | null } | null,
  nowMs = Date.parse(ct("2026-10-22", "09:00")),
} = {}) {
  return buildInvoice({ theCase, booking, slot: withSlot ? slot : null, sessionTime, firm, nowMs });
}

const FILTERS = {
  gender: ["Female"],
  race: [],
  age: { min: 25, max: 60 },
  eligibility: { served_on_jury: "No", us_citizen: "Any" },
} as unknown as CaseFilters;

describe("invoice number", () => {
  it("is INV- and the case id's first 8 characters, upper case", () => {
    expect(invoiceNumber(CASE_ID)).toBe("INV-3F9A12BC");
  });
});

describe("rows and total: the same as the firm's Receipt Value", () => {
  it("bills the hours at the online rate, worded as the receipt words it", () => {
    const inv = invoiceFor();
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({
      description: "Online focus group — Smith v. Jones",
      quantity: "2 hours × $850.00/hr",
      amountCents: 170_000,
    });
    expect(inv.totalCents).toBe(170_000);
  });

  it("has one row per filter, with the receipt's labels and amounts", () => {
    const inv = invoiceFor({ theCase: aCase({ filters: FILTERS }) });
    const receipt = calculateReceiptPrice(FILTERS, 2, "online");
    expect(inv.lines.slice(1)).toEqual(
      receipt.filterItems.map((f) => ({
        description: `${f.label} filter`,
        details: [],
        quantity: null,
        amountCents: f.costCents,
      }))
    );
    expect(inv.lines.slice(1).map((l) => l.description)).toEqual(["Gender filter", "Age filter", "Served on Jury filter"]);
    expect(inv.totalCents).toBe(receipt.totalCostCents);
  });

  it("bills an in-person case at its rate, at Heritage Plaza", () => {
    const theCase = aCase({ delivery_mode: "offline", hours_requested: 3, filters: FILTERS });
    const inv = invoiceFor({ theCase, booking: null, withSlot: false });
    expect(inv.lines[0].description).toBe("In-person focus group — Smith v. Jones");
    expect(inv.lines[0].quantity).toBe("3 hours × $1,500.00/hr");
    expect(inv.lines[0].details).toEqual(["Heritage Plaza Office Suites · 402 Simonton St, Conroe, TX 77301"]);
    expect(inv.totalCents).toBe(calculateReceiptPrice(FILTERS, 3, "offline").totalCostCents);
  });

  it("bills 1 hour when the case asks for none", () => {
    const inv = invoiceFor({ theCase: aCase({ hours_requested: null }) });
    expect(inv.lines[0].quantity).toBe("1 hour × $850.00/hr");
    expect(inv.totalCents).toBe(85_000);
  });

  it("says when: the session once there is one, else the time held", () => {
    expect(invoiceFor().lines[0].details).toEqual(["Thu, Oct 29, 2026 · 9:00 AM – 12:00 PM CT"]);
    const inSession = invoiceFor({ sessionTime: { sessionDate: "2026-10-29", time: "9:00 AM – 11:00 AM CT" } });
    expect(inSession.lines[0].details).toEqual(["Thu, Oct 29, 2026 · 9:00 AM – 11:00 AM CT"]);
  });
});

describe("status and dates", () => {
  it("is unpaid, due 24 working hours after the hold", () => {
    const inv = invoiceFor();
    expect(inv.status).toBe("unpaid");
    expect(inv.dueAt).toBe(paymentDueAt(heldSince).toISOString());
    expect(inv.issuedAt).toBe(heldSince);
  });

  it("is overdue once the deadline passes, or the time comes unpaid", () => {
    expect(invoiceFor({ nowMs: Date.parse(ct("2026-10-22", "15:00")) }).status).toBe("overdue");
    expect(invoiceFor({ nowMs: Date.parse(ct("2026-10-29", "09:00")) }).status).toBe("overdue");
  });

  it("is paid once an admin marks it, with no due date", () => {
    const inv = invoiceFor({ booking: { held_since: heldSince, paid_at: ct("2026-10-21", "16:00") } });
    expect(inv.status).toBe("paid");
    expect(inv.paidAt).toBe(ct("2026-10-21", "16:00"));
    expect(inv.dueAt).toBeNull();
  });

  it("is dated when approved, else when created, without a held time", () => {
    expect(invoiceFor({ booking: null, withSlot: false }).issuedAt).toBe(ct("2026-10-20", "10:00"));
    const notApproved = invoiceFor({ theCase: aCase({ approved_at: null }), booking: null, withSlot: false });
    expect(notApproved.issuedAt).toBe(ct("2026-10-19", "10:00"));
    expect(notApproved.status).toBe("unpaid");
    expect(notApproved.dueAt).toBeNull();
  });

  it("bills the firm by name, else by email", () => {
    expect(invoiceFor().billedTo).toEqual({ name: "Jane Doe", email: "jane@firm.com" });
    const noName = buildInvoice({
      theCase: aCase(),
      booking: null,
      slot: null,
      sessionTime: null,
      firm: { name: null, email: "jane@firm.com" },
      nowMs: 0,
    });
    expect(noName.billedTo.name).toBe("jane@firm.com");
  });
});

/* ---------------------------------------------------------------------------
   Who can open an invoice. The page reads with the service role, so it must
   check the caller itself: an admin sees any case, a firm only its own.
--------------------------------------------------------------------------- */

class RedirectError extends Error {}
class NotFoundError extends Error {}

const mocks = vi.hoisted(() => ({
  user: { current: null as { id: string } | null },
  role: { current: null as string | null },
  getInvoiceData: vi.fn(),
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
vi.mock("@/lib/invoiceData", () => ({ getInvoiceData: mocks.getInvoiceData }));
vi.mock("@/components/PrintInvoiceButton", () => ({ default: () => "[print]" }));

describe("invoice page access", () => {
  const params = Promise.resolve({ caseId: CASE_ID });

  beforeEach(() => {
    mocks.user.current = { id: "firm-1" };
    mocks.role.current = "requestee";
    mocks.getInvoiceData.mockReset();
    mocks.getInvoiceData.mockResolvedValue({ invoice: invoiceFor(), ownerIds: ["firm-1"] });
  });

  async function render() {
    const { default: InvoicePage } = await import("@/app/invoice/[caseId]/page");
    return renderToStaticMarkup((await InvoicePage({ params })) as ReactElement);
  }

  it("shows the firm its own case's invoice", async () => {
    const html = await render();
    expect(html).toContain("INV-3F9A12BC");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("$1,700.00");
    expect(html).toContain("Amount due");
    expect(html).toContain(`/dashboard/requestee/${CASE_ID}`);
  });

  it("hides another firm's case as if it didn't exist", async () => {
    mocks.getInvoiceData.mockResolvedValue({ invoice: invoiceFor(), ownerIds: ["firm-2"] });
    await expect(render()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shows an admin any case, linking back to the admin's case page", async () => {
    mocks.user.current = { id: "admin-1" };
    mocks.role.current = "admin";
    mocks.getInvoiceData.mockResolvedValue({ invoice: invoiceFor(), ownerIds: ["firm-2"] });
    expect(await render()).toContain(`/dashboard/Admin/${CASE_ID}`);
  });

  it("turns away participants and signed-out visitors before reading anything", async () => {
    mocks.role.current = "participant";
    await expect(render()).rejects.toThrow("/dashboard");
    mocks.user.current = null;
    await expect(render()).rejects.toThrow("/auth/login");
    expect(mocks.getInvoiceData).not.toHaveBeenCalled();
  });

  it("says Total paid once paid", async () => {
    mocks.getInvoiceData.mockResolvedValue({
      invoice: invoiceFor({ booking: { held_since: heldSince, paid_at: ct("2026-10-21", "16:00") } }),
      ownerIds: ["firm-1"],
    });
    const html = await render();
    expect(html).toContain("Total paid");
    expect(html).toContain("paid in full");
  });
});
