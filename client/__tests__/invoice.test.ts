import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  invoiceContent,
  invoiceView,
  isInvoiceable,
  issuedAtFor,
  planInvoice,
  type InvoiceCase,
  type InvoiceContent,
  type InvoiceRecord,
} from "@/lib/invoice";
import { calculateReceiptPrice } from "@/lib/receipt-pricing";
import { paymentDueAt } from "@/lib/slotBooking";
import type { CaseFilters } from "@/lib/filter-utils";

// October 2026 is Central Daylight Time (UTC-5).
const ct = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();

const CASE_ID = "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b";
const slot = { starts_at: ct("2026-10-29", "09:00"), ends_at: ct("2026-10-29", "12:00") };
const heldSince = ct("2026-10-21", "15:00"); // Wed 3 PM: due Thu 3 PM
const firm = { name: "Jane Doe", email: "jane@firm.com" };

function aCase(overrides: Partial<InvoiceCase> = {}): InvoiceCase {
  return {
    id: CASE_ID,
    title: "Smith v. Jones",
    filters: null,
    hours_requested: 2,
    delivery_mode: "online",
    admin_status: "approved",
    deleted_at: null,
    approved_at: ct("2026-10-20", "10:00"),
    ...overrides,
  };
}

const FILTERS = {
  gender: ["Female"],
  race: [],
  age: { min: 25, max: 60 },
  eligibility: { served_on_jury: "No", us_citizen: "Any" },
} as unknown as CaseFilters;

function contentFor(theCase = aCase(), withSlot = true, sessionTime: { sessionDate: string; time: string | null } | null = null) {
  return invoiceContent({ theCase, slot: withSlot ? slot : null, sessionTime, firm });
}

function aRecord(content: InvoiceContent = contentFor(), overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1",
    invoice_number: "INV-2026-0007",
    case_id: CASE_ID,
    issued_at: heldSince,
    revised_at: null,
    voided_at: null,
    ...content,
    ...overrides,
  };
}

describe("what the invoice says: the same rows as the firm's Receipt Value", () => {
  it("bills the hours at the online rate, worded as the receipt words it", () => {
    const content = contentFor();
    expect(content.lines).toHaveLength(1);
    expect(content.lines[0]).toMatchObject({
      description: "Online focus group — Smith v. Jones",
      quantity: "2 hours × $850.00/hr",
      amountCents: 170_000,
    });
    expect(content.total_cents).toBe(170_000);
    expect(content).toMatchObject({ case_title: "Smith v. Jones", delivery_mode: "online", billed_to_name: "Jane Doe" });
  });

  it("has one row per filter, with the receipt's labels and amounts", () => {
    const content = contentFor(aCase({ filters: FILTERS }));
    const receipt = calculateReceiptPrice(FILTERS, 2, "online");
    expect(content.lines.slice(1)).toEqual(
      receipt.filterItems.map((f) => ({ description: `${f.label} filter`, details: [], quantity: null, amountCents: f.costCents }))
    );
    expect(content.lines.slice(1).map((l) => l.description)).toEqual(["Gender filter", "Age filter", "Served on Jury filter"]);
    expect(content.total_cents).toBe(receipt.totalCostCents);
  });

  it("bills an in-person case at its rate, at Heritage Plaza", () => {
    const content = contentFor(aCase({ delivery_mode: "offline", hours_requested: 3, filters: FILTERS }), false);
    expect(content.lines[0].description).toBe("In-person focus group — Smith v. Jones");
    expect(content.lines[0].quantity).toBe("3 hours × $1,500.00/hr");
    expect(content.lines[0].details).toEqual(["Heritage Plaza Office Suites · 402 Simonton St, Conroe, TX 77301"]);
    expect(content.delivery_mode).toBe("offline");
    expect(content.total_cents).toBe(calculateReceiptPrice(FILTERS, 3, "offline").totalCostCents);
  });

  it("bills 1 hour when the case asks for none", () => {
    const content = contentFor(aCase({ hours_requested: null }));
    expect(content.lines[0].quantity).toBe("1 hour × $850.00/hr");
    expect(content.total_cents).toBe(85_000);
  });

  it("says when, with the year: the session once there is one, else the time held", () => {
    expect(contentFor().lines[0].details).toEqual(["Thu, Oct 29, 2026 · 9:00 AM – 12:00 PM CT"]);
    const inSession = contentFor(aCase(), true, { sessionDate: "2026-10-29", time: "9:00 AM – 11:00 AM CT" });
    expect(inSession.lines[0].details).toEqual(["Thu, Oct 29, 2026 · 9:00 AM – 11:00 AM CT"]);
  });
});

describe("when a case is billed", () => {
  it("once approved, or once its firm holds a time, unless rejected or archived", () => {
    expect(isInvoiceable(aCase(), null)).toBe(true);
    expect(isInvoiceable(aCase({ admin_status: "submitted" }), null)).toBe(true);
    expect(isInvoiceable(aCase({ admin_status: "all" }), null)).toBe(false);
    expect(isInvoiceable(aCase({ admin_status: "all" }), { held_since: heldSince, paid_at: null })).toBe(true);
    expect(isInvoiceable(aCase({ admin_status: "rejected" }), { held_since: heldSince, paid_at: null })).toBe(false);
    expect(isInvoiceable(aCase({ deleted_at: heldSince }), null)).toBe(false);
  });

  it("is dated when the time was taken, else when approved, else now", () => {
    const now = Date.parse(ct("2026-10-23", "12:00"));
    expect(issuedAtFor(aCase(), { held_since: heldSince, paid_at: null }, now)).toBe(heldSince);
    expect(issuedAtFor(aCase(), null, now)).toBe(ct("2026-10-20", "10:00"));
    expect(issuedAtFor(aCase({ approved_at: null }), null, now)).toBe(new Date(now).toISOString());
  });
});

describe("planInvoice: issue, revise while unpaid, void, freeze once paid", () => {
  const unpaid = { held_since: heldSince, paid_at: null };
  const paid = { held_since: heldSince, paid_at: ct("2026-10-21", "16:00") };
  const changed = contentFor(aCase({ filters: FILTERS }));

  it.each([
    ["no invoice, case under review, no time held", null, aCase({ admin_status: "all" }), null, contentFor(), "none"],
    ["no invoice, case approved", null, aCase(), null, contentFor(), "issue"],
    ["no invoice, time held while under review", null, aCase({ admin_status: "all" }), unpaid, contentFor(), "issue"],
    ["no invoice, case rejected", null, aCase({ admin_status: "rejected" }), unpaid, contentFor(), "none"],
    ["unpaid, unchanged", aRecord(), aCase(), unpaid, contentFor(), "none"],
    ["unpaid, case changed", aRecord(), aCase(), unpaid, changed, "revise"],
    ["paid, case changed: frozen", aRecord(), aCase(), paid, changed, "none"],
    ["unpaid, case rejected", aRecord(), aCase({ admin_status: "rejected" }), unpaid, contentFor(), "void"],
    ["unpaid, case archived", aRecord(), aCase({ deleted_at: heldSince }), null, contentFor(), "void"],
    ["paid, case rejected: stays paid", aRecord(), aCase({ admin_status: "rejected" }), paid, contentFor(), "none"],
    ["voided, still rejected", aRecord(contentFor(), { voided_at: heldSince }), aCase({ admin_status: "rejected" }), null, contentFor(), "none"],
    ["voided, case approved again", aRecord(contentFor(), { voided_at: heldSince }), aCase(), null, contentFor(), "revise"],
  ] as const)("%s → %s", (_label, record, theCase, booking, content, expected) => {
    expect(planInvoice({ record, content, theCase, booking })).toBe(expected);
  });

  it("compares lines field by field, whatever order the database returns their keys in", () => {
    const content = contentFor(aCase({ filters: FILTERS }));
    const fromDb = {
      ...content,
      lines: content.lines.map((l) => ({ amountCents: l.amountCents, quantity: l.quantity, details: l.details, description: l.description })),
    };
    expect(planInvoice({ record: aRecord(fromDb), content, theCase: aCase(), booking: unpaid })).toBe("none");
  });
});

describe("invoiceView: the kept invoice, with where payment stands now", () => {
  const record = aRecord();
  const at = (date: string, time: string) => Date.parse(ct(date, time));

  it("is unpaid, due 24 working hours after the hold", () => {
    const view = invoiceView({ record, booking: { held_since: heldSince, paid_at: null }, slot, nowMs: at("2026-10-22", "09:00") });
    expect(view).toMatchObject({ number: "INV-2026-0007", issuedAt: heldSince, status: "unpaid", totalCents: 170_000 });
    expect(view.dueAt).toBe(paymentDueAt(heldSince).toISOString());
  });

  it("is overdue once the deadline passes, or the time comes unpaid", () => {
    const booking = { held_since: heldSince, paid_at: null };
    expect(invoiceView({ record, booking, slot, nowMs: at("2026-10-22", "15:00") }).status).toBe("overdue");
    expect(invoiceView({ record, booking, slot, nowMs: at("2026-10-29", "09:00") }).status).toBe("overdue");
  });

  it("is paid once an admin marks it, with no due date", () => {
    const view = invoiceView({ record, booking: { held_since: heldSince, paid_at: ct("2026-10-21", "16:00") }, slot, nowMs: 0 });
    expect(view).toMatchObject({ status: "paid", paidAt: ct("2026-10-21", "16:00"), dueAt: null });
  });

  it("is void, with nothing due, once voided", () => {
    const view = invoiceView({
      record: aRecord(contentFor(), { voided_at: heldSince }),
      booking: { held_since: heldSince, paid_at: null },
      slot,
      nowMs: at("2026-10-23", "09:00"),
    });
    expect(view).toMatchObject({ status: "void", dueAt: null });
  });

  it("is unpaid with no due date without a held time", () => {
    expect(invoiceView({ record, booking: null, slot: null, nowMs: 0 })).toMatchObject({ status: "unpaid", dueAt: null });
  });

  it("bills the firm by name, else by email", () => {
    expect(invoiceView({ record, booking: null, slot: null, nowMs: 0 }).billedTo).toEqual({ name: "Jane Doe", email: "jane@firm.com" });
    const noName = aRecord({ ...contentFor(), billed_to_name: null });
    expect(invoiceView({ record: noName, booking: null, slot: null, nowMs: 0 }).billedTo.name).toBe("jane@firm.com");
  });
});

/* ---------------------------------------------------------------------------
   syncInvoice against a fake service-role client: what it writes, and when.
--------------------------------------------------------------------------- */

const db = vi.hoisted(() => ({
  caseRow: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  booking: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/admin", () => {
  const read = (table: string) => {
    if (table === "cases") return db.caseRow;
    if (table === "invoices") return db.invoice;
    if (table === "confidentiality_agreements_requestee") return { first_name: "Jane", last_name: "Doe" };
    if (table === "roles") return { email: "jane@firm.com" };
    return null;
  };
  return {
    supabaseAdmin: {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: read(table), error: null }) }) }),
        update: (changes: Record<string, unknown>) => {
          db.updates.push(changes);
          return {
            eq: () => ({
              select: () => ({ single: async () => ({ data: { ...db.invoice, ...changes }, error: null }) }),
            }),
          };
        },
      }),
      rpc: (fn: string, args: Record<string, unknown>) => ({
        single: async () => {
          db.rpc(fn, args);
          return { data: { ...args, id: "inv-new", invoice_number: "INV-2026-0001", issued_at: args.p_issued_at }, error: null };
        },
      }),
    },
  };
});
vi.mock("@/lib/slotBookingData", () => ({
  getBookingsForCases: async () => new Map(db.booking ? [[CASE_ID, { ...db.booking, slot }]] : []),
}));

describe("syncInvoice", () => {
  const NOW = Date.parse(ct("2026-10-22", "09:00"));
  const row = (overrides: Partial<InvoiceCase> = {}) => ({
    ...aCase(overrides),
    user_id: "firm-1",
    requestee_id: null,
    session_cases: [],
  });

  beforeEach(() => {
    db.caseRow = row();
    db.invoice = null;
    db.booking = { case_id: CASE_ID, slot_id: "slot-1", held_since: heldSince, paid_at: null };
    db.rpc.mockReset();
    db.updates = [];
  });

  async function sync() {
    const { syncInvoice } = await import("@/lib/invoiceData");
    return syncInvoice(CASE_ID, NOW);
  }

  it("issues a billed case's invoice through issue_invoice, dated when the time was held", async () => {
    const result = await sync();
    expect(db.rpc).toHaveBeenCalledWith(
      "issue_invoice",
      expect.objectContaining({
        p_case_id: CASE_ID,
        p_firm_id: "firm-1",
        p_issued_at: heldSince,
        p_billed_to_name: "Jane Doe",
        p_billed_to_email: "jane@firm.com",
        p_total_cents: 170_000,
      })
    );
    expect(result?.invoice?.number).toBe("INV-2026-0001");
    expect(result?.ownerIds).toEqual(["firm-1"]);
  });

  it("issues nothing for a case not billed yet", async () => {
    db.caseRow = row({ admin_status: "all" });
    db.booking = null;
    const result = await sync();
    expect(db.rpc).not.toHaveBeenCalled();
    expect(result?.invoice).toBeNull();
  });

  it("leaves a matching invoice alone, and revises one the case has moved on from", async () => {
    db.invoice = aRecord();
    await sync();
    expect(db.updates).toEqual([]);

    db.caseRow = row({ filters: FILTERS });
    const result = await sync();
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({ total_cents: 200_000, voided_at: null });
    expect(result?.invoice?.number).toBe("INV-2026-0007");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("never touches a paid invoice", async () => {
    db.invoice = aRecord();
    db.caseRow = row({ filters: FILTERS, admin_status: "rejected" });
    db.booking = { case_id: CASE_ID, slot_id: "slot-1", held_since: heldSince, paid_at: ct("2026-10-21", "16:00") };
    const result = await sync();
    expect(db.updates).toEqual([]);
    expect(result?.invoice).toMatchObject({ status: "paid", totalCents: 170_000 });
  });

  it("voids an unpaid invoice when its case is rejected", async () => {
    db.invoice = aRecord();
    db.caseRow = row({ admin_status: "rejected" });
    const result = await sync();
    expect(db.updates).toEqual([{ voided_at: new Date(NOW).toISOString() }]);
    expect(result?.invoice?.status).toBe("void");
  });

  it("returns null for no such case", async () => {
    db.caseRow = null;
    expect(await sync()).toBeNull();
  });
});

