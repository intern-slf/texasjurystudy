import { describe, it, expect } from "vitest";
import {
  adminPromoMessage,
  discountCents,
  firmPromoMessage,
  isValidPercentOff,
  isValidPromoCode,
  normalizePromoCode,
  parsePromoCodeInput,
  promoCodeStatus,
  type PromoCodeInput,
} from "@/lib/promoCode";
import { calculateReceiptPrice, formatCents } from "@/lib/receipt-pricing";
import { invoiceContent, planInvoice, type InvoiceCase, type InvoiceRecord } from "@/lib/invoice";
import type { CaseFilters } from "@/lib/filter-utils";

// ---------------------------------------------------------------------------
// Promo codes (lib/promoCode.ts): a whole percentage, 1 to 99, off a case's
// whole total, shown on the receipt and the invoice as a line of its own. The
// rules that need the database (limits, use counts, nothing once paid) live in
// 20261027_promo_codes.sql and check themselves when it runs; the actions that
// call them are in promo-code-actions.test.ts.
// ---------------------------------------------------------------------------

const FIRM_A = "0f000000-0000-4000-8000-000000000001";
const FIRM_B = "0f000000-0000-4000-8000-000000000002";

const TWO_FILTERS = { gender: ["Female"], race: ["Asian"] } as unknown as CaseFilters;

describe("a code as it's typed", () => {
  it("is matched in capitals, trimmed", () => {
    expect(normalizePromoCode("  fall10 ")).toBe("FALL10");
    expect(normalizePromoCode(undefined)).toBe("");
    expect(normalizePromoCode(42)).toBe("");
  });

  it("is 3 to 32 letters, digits, - or _, starting with a letter or digit", () => {
    expect(isValidPromoCode("FALL10")).toBe(true);
    expect(isValidPromoCode("VIP_2026-Q4")).toBe(true);
    // Lower case is normalized before it gets here.
    expect(isValidPromoCode("vip_2026-q4")).toBe(false);
    expect(isValidPromoCode("AB")).toBe(false);
    expect(isValidPromoCode("A".repeat(33))).toBe(false);
    expect(isValidPromoCode("-FALL")).toBe(false);
    expect(isValidPromoCode("FALL 10")).toBe(false);
    expect(isValidPromoCode("")).toBe(false);
  });
});

describe("the percentage", () => {
  it("is a whole number from 1 to 99: a case is never free", () => {
    expect(isValidPercentOff(1)).toBe(true);
    expect(isValidPercentOff(99)).toBe(true);
    expect(isValidPercentOff(0)).toBe(false);
    expect(isValidPercentOff(100)).toBe(false);
    expect(isValidPercentOff(12.5)).toBe(false);
    expect(isValidPercentOff(Number.NaN)).toBe(false);
    expect(isValidPercentOff("10")).toBe(false);
  });

  it("takes whole cents off, rounded", () => {
    expect(discountCents(170_000, 10)).toBe(17_000);
    // 1.25 hours online: $1,062.50, and 15% of it is $159.375.
    expect(discountCents(106_250, 15)).toBe(15_938);
  });
});

describe("the receipt", () => {
  it("is unchanged without a discount", () => {
    const breakdown = calculateReceiptPrice(TWO_FILTERS, 2, "online");
    expect(breakdown).toMatchObject({
      subtotalCents: 190_000,
      discountPercent: null,
      discountCents: 0,
      totalCostCents: 190_000,
    });
  });

  it("takes the percentage off the whole total, filters included", () => {
    const breakdown = calculateReceiptPrice(TWO_FILTERS, 2, "online", 10);
    expect(breakdown).toMatchObject({
      baseCostCents: 170_000,
      filterCostCents: 20_000,
      subtotalCents: 190_000,
      discountPercent: 10,
      discountCents: 19_000,
      totalCostCents: 171_000,
    });
  });

  it("applies to the in-person rate the same way", () => {
    expect(calculateReceiptPrice(null, 3, "offline", 20).totalCostCents).toBe(360_000);
  });

  it("ignores a percentage out of range rather than pricing from it", () => {
    for (const bad of [0, 100, 150, -5, 12.5]) {
      const breakdown = calculateReceiptPrice(TWO_FILTERS, 2, "online", bad);
      expect(breakdown.discountPercent).toBeNull();
      expect(breakdown.totalCostCents).toBe(190_000);
    }
  });

  it("writes the discount as a negative amount, with a plain hyphen the invoice PDF can draw", () => {
    expect(formatCents(-19_000)).toBe("-$190.00");
    expect(formatCents(171_000)).toBe("$1,710.00");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("the invoice", () => {
  const theCase: InvoiceCase = {
    id: "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b",
    title: "Smith v. Jones",
    filters: TWO_FILTERS,
    hours_requested: 2,
    delivery_mode: "online",
    admin_status: "approved",
    deleted_at: null,
    approved_at: "2026-10-20T15:00:00.000Z",
  };
  const firm = { name: "Jane Doe", email: "jane@firm.com" };
  const content = (discountPercent: number | null) =>
    invoiceContent({ theCase, slot: null, sessionTime: null, firm, discountPercent });

  it("gets a discount line after the filters, named by its percentage, not its code", () => {
    const { lines, total_cents } = content(10);
    expect(lines.map((l) => l.description)).toEqual([
      "Online focus group — Smith v. Jones",
      "Gender filter",
      "Race filter",
      "Discount (10% off)",
    ]);
    expect(lines[3]).toEqual({ description: "Discount (10% off)", details: [], quantity: null, amountCents: -19_000 });
    expect(total_cents).toBe(171_000);
  });

  it("adds up: the lines sum to the total", () => {
    const { lines, total_cents } = content(15);
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(total_cents);
  });

  it("has no discount line without one, as before", () => {
    expect(content(null).lines).toHaveLength(3);
    expect(content(null).total_cents).toBe(190_000);
  });

  const record = (discountPercent: number | null): InvoiceRecord => ({
    id: "inv-1",
    invoice_number: "INV-2026-0007",
    case_id: theCase.id,
    issued_at: "2026-10-20T15:00:00.000Z",
    revised_at: null,
    voided_at: null,
    ...content(discountPercent),
  });

  it("is revised when a discount is added, changed or removed while unpaid", () => {
    const unpaid = { held_since: null, paid_at: null };
    expect(planInvoice({ record: record(null), content: content(10), theCase, booking: unpaid })).toBe("revise");
    expect(planInvoice({ record: record(10), content: content(20), theCase, booking: unpaid })).toBe("revise");
    expect(planInvoice({ record: record(10), content: content(null), theCase, booking: unpaid })).toBe("revise");
    expect(planInvoice({ record: record(10), content: content(10), theCase, booking: unpaid })).toBe("none");
  });

  it("is left alone once paid, whatever the discount says now", () => {
    const paid = { held_since: "2026-10-20T15:00:00.000Z", paid_at: "2026-10-21T15:00:00.000Z" };
    expect(planInvoice({ record: record(10), content: content(null), theCase, booking: paid })).toBe("none");
  });
});

describe("what a refused code says", () => {
  it("tells a firm the same thing for a code that doesn't exist, is switched off, or is another firm's", () => {
    const missing = firmPromoMessage("not_found");
    expect(firmPromoMessage("inactive")).toBe(missing);
    expect(firmPromoMessage("not_for_firm")).toBe(missing);
    expect(firmPromoMessage("expired")).not.toBe(missing);
    expect(firmPromoMessage("used_up")).not.toBe(missing);
    expect(firmPromoMessage("paid")).toMatch(/paid/);
  });

  it("tells an admin the actual reason", () => {
    const reasons = ["not_found", "inactive", "not_for_firm", "expired", "used_up", "paid"].map(adminPromoMessage);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("has a fallback for an answer it doesn't know", () => {
    expect(firmPromoMessage(null)).toMatch(/Try again/);
    expect(adminPromoMessage("something_new")).toMatch(/Try again/);
  });
});

describe("where a code stands on the admin's list", () => {
  const today = "2026-10-27";
  const code = { active: true, expires_on: null as string | null, max_uses: null as number | null };

  it("is active until switched off, past its last day, or fully used", () => {
    expect(promoCodeStatus(code, 0, today)).toBe("active");
    expect(promoCodeStatus({ ...code, active: false }, 0, today)).toBe("off");
    expect(promoCodeStatus({ ...code, expires_on: today }, 0, today)).toBe("active");
    expect(promoCodeStatus({ ...code, expires_on: "2026-10-26" }, 0, today)).toBe("expired");
    expect(promoCodeStatus({ ...code, max_uses: 2 }, 1, today)).toBe("active");
    expect(promoCodeStatus({ ...code, max_uses: 2 }, 2, today)).toBe("used_up");
  });

  it("reads switched off first: that's what the admin can change", () => {
    expect(promoCodeStatus({ active: false, expires_on: "2026-01-01", max_uses: 1 }, 5, today)).toBe("off");
  });
});

describe("the admin's form", () => {
  const valid: PromoCodeInput = {
    code: " fall10 ",
    percentOff: 10,
    expiresOn: null,
    maxUses: null,
    firmsOnly: false,
    firmIds: [],
  };

  it("saves the code in capitals, open to every firm with no limits", () => {
    expect(parsePromoCodeInput(valid)).toEqual({
      ok: true,
      values: { code: "FALL10", percent_off: 10, expires_on: null, max_uses: null, firms_only: false, firmIds: [] },
    });
  });

  it("keeps a last day, a use limit and a firm list", () => {
    const parsed = parsePromoCodeInput({
      ...valid,
      expiresOn: "2026-12-31",
      maxUses: 5,
      firmsOnly: true,
      firmIds: [FIRM_A, FIRM_B, FIRM_A],
    });
    expect(parsed).toEqual({
      ok: true,
      values: {
        code: "FALL10",
        percent_off: 10,
        expires_on: "2026-12-31",
        max_uses: 5,
        firms_only: true,
        firmIds: [FIRM_A, FIRM_B],
      },
    });
  });

  it("drops the firm list when every firm may use it", () => {
    const parsed = parsePromoCodeInput({ ...valid, firmsOnly: false, firmIds: [FIRM_A] });
    expect(parsed.ok && parsed.values.firmIds).toEqual([]);
  });

  it.each([
    ["a code too short", { code: "AB" }],
    ["a code with spaces", { code: "FALL 10" }],
    ["no percentage", { percentOff: Number.NaN }],
    ["0%", { percentOff: 0 }],
    ["100%", { percentOff: 100 }],
    ["a fraction of a percent", { percentOff: 12.5 }],
    ["a date that doesn't exist", { expiresOn: "2026-02-30" }],
    ["a date in another format", { expiresOn: "12/31/2026" }],
    ["0 uses", { maxUses: 0 }],
    ["a fraction of a use", { maxUses: 1.5 }],
    ["firms only, with none picked", { firmsOnly: true, firmIds: [] }],
    ["a firm id that isn't one", { firmsOnly: true, firmIds: ["not-a-uuid"] }],
  ])("refuses %s", (_label, change) => {
    const parsed = parsePromoCodeInput({ ...valid, ...change });
    expect(parsed.ok).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(parsePromoCodeInput(null).ok).toBe(false);
  });
});
