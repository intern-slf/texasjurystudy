import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import CasePaymentPrompt from "@/components/CasePaymentPrompt";

/* ---------------------------------------------------------------------------
   The payment box under a case on the firm's dashboard: nothing before the
   case is scheduled, then its due date and a way to pay, and no Pay once the
   money is paid or on its way.
--------------------------------------------------------------------------- */

const CASE_ID = "0c000000-0000-4000-8000-000000000001";
// Thu Nov 26, 11:59 PM CST.
const DUE = new Date("2026-11-27T05:59:00.000Z");
const BEFORE = Date.parse("2026-11-26T15:00:00.000Z");
const AFTER = Date.parse("2026-11-27T12:00:00.000Z");

const render = (over: Partial<Parameters<typeof CasePaymentPrompt>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CasePaymentPrompt, {
      caseId: CASE_ID,
      dueAt: DUE,
      paid: false,
      underway: null,
      payOnline: true,
      nowMs: BEFORE,
      ...over,
    })
  );

describe("CasePaymentPrompt", () => {
  it("shows nothing before the case is scheduled", () => {
    expect(render({ dueAt: null })).toBe("");
  });

  it("asks for payment by the end of the day, with a Pay button to the invoice", () => {
    const html = render();
    expect(html).toContain("Payment is due by Thu, Nov 26, 11:59 PM CT.");
    expect(html).toContain("Pay invoice");
    expect(html).toContain(`href="/invoice/${CASE_ID}"`);
  });

  it("says it was due once the day is over", () => {
    expect(render({ nowMs: AFTER })).toContain("Payment was due Thu, Nov 26, 11:59 PM CT.");
  });

  it("links to the invoice, not Pay, while online payment is off", () => {
    const html = render({ payOnline: false });
    expect(html).toContain("View invoice");
    expect(html).not.toContain("Pay invoice");
  });

  it("doesn't ask again once a bank payment is on its way, or a payment is being checked", () => {
    expect(render({ underway: "processing" })).toContain("bank payment is on its way");
    expect(render({ underway: "review" })).toContain("checking it against the invoice");
    expect(render({ underway: "processing" })).not.toContain("Pay invoice");
  });

  it("says paid once paid, scheduled or not", () => {
    expect(render({ paid: true, dueAt: null })).toContain("Invoice paid");
    expect(render({ paid: true })).not.toContain("Pay invoice");
  });
});
