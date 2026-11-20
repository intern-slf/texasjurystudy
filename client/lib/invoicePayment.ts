import type { InvoiceView } from "@/lib/invoice";

/**
 * Paying an invoice online with Stripe Checkout: the rules, with no I/O.
 * The data side is lib/invoicePaymentData.ts, the firm's action
 * lib/actions/requesteeInvoicePayment.ts, and the webhook
 * app/api/stripe/webhook/route.ts.
 */

/** A row of public.invoice_payments (20261119_invoice_payments.sql). */
export type InvoicePaymentStatus = "open" | "processing" | "succeeded" | "failed" | "expired" | "review";

export type InvoicePaymentRow = {
  id: string;
  case_id: string | null;
  invoice_id: string | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  /** Made with a live key; a test (sandbox) payment never counts as a live one (20261121). */
  livemode: boolean;
  status: InvoicePaymentStatus;
  created_at: string;
  succeeded_at: string | null;
  /** What the firm paid with, copied from Stripe's charge (20261120_invoice_payment_method.sql). */
  method_type: string | null;
  /** The card brand ("visa"), or the bank's name. */
  method_brand: string | null;
  method_last4: string | null;
};

/** What a payment was made with: the three method_ columns. */
export type PaymentMethodInfo = Pick<InvoicePaymentRow, "method_type" | "method_brand" | "method_last4">;

/** Stripe won't charge less than 50 cents. */
export const STRIPE_MIN_CHARGE_CENTS = 50;

/** How long a Checkout session stays open. Short, so a firm can't pay an amount the invoice has since moved on from. */
export const CHECKOUT_TTL_MINUTES = 60;

/** Tags our sessions in the Stripe Dashboard. One fixed label for this flow. */
export const CHECKOUT_INTEGRATION_ID = "tjs_invoice_pay_kqwhrzvm";

/**
 * Whether a firm can pay this invoice online now: it's owed, not tiny, and no
 * bank payment for it is already on its way. Returns why not, for the page.
 */
export function onlinePaymentBlock(
  invoice: Pick<InvoiceView, "status" | "totalCents">,
  payments: Pick<InvoicePaymentRow, "status">[]
): "paid" | "void" | "review" | "processing" | "too_small" | null {
  if (invoice.status === "paid" || payments.some((p) => p.status === "succeeded")) return "paid";
  if (invoice.status === "void") return "void";
  if (payments.some((p) => p.status === "review")) return "review";
  if (payments.some((p) => p.status === "processing")) return "processing";
  if (invoice.totalCents < STRIPE_MIN_CHARGE_CENTS) return "too_small";
  return null;
}

/**
 * What a Checkout webhook event means for our row. Only `paid` marks the case
 * paid: a bank (ACH) payment completes the session while still unpaid, and
 * succeeds or fails days later.
 */
export function checkoutEventOutcome(
  type: string,
  paymentStatus: string | null | undefined
): "paid" | "processing" | "failed" | "expired" | null {
  switch (type) {
    case "checkout.session.completed":
      return paymentStatus === "unpaid" ? "processing" : "paid";
    case "checkout.session.async_payment_succeeded":
      return "paid";
    case "checkout.session.async_payment_failed":
      return "failed";
    case "checkout.session.expired":
      return "expired";
    default:
      return null;
  }
}

/**
 * The statuses a row may move to `next` from. A row only moves forward, so an
 * event Stripe delivers late or twice can't undo a later one: an `expired`
 * that arrives after `succeeded` changes nothing.
 */
export function canMoveTo(next: InvoicePaymentStatus): InvoicePaymentStatus[] {
  switch (next) {
    case "processing":
      return ["open"];
    case "succeeded":
      return ["open", "processing", "failed", "expired"];
    case "failed":
      return ["open", "processing"];
    case "expired":
      return ["open"];
    case "review":
      return ["open", "processing", "failed", "expired"];
    case "open":
      return [];
  }
}

/** Why money that arrived didn't mark the case paid, for an admin to sort out. */
export type ReviewReason = "amount" | "already_paid" | "void" | "no_invoice";

/**
 * Whether money Stripe received (`chargedCents`, at `paidAt`) pays the
 * invoice as it stands now, or needs an admin to look first. The amount was
 * fixed when Checkout opened, and the case can change after that (a discount
 * removed, hours added) until it's paid, so a payment only marks the case paid
 * when it's exactly what's owed. `pay` also when this same payment already
 * marked it paid (a retried event).
 */
export function settleOutcome(
  invoice: Pick<InvoiceView, "status" | "totalCents" | "paidAt"> | null,
  chargedCents: number,
  paidAt: string
): "pay" | ReviewReason {
  if (!invoice) return "no_invoice";
  if (invoice.status === "paid") {
    return invoice.paidAt && Date.parse(invoice.paidAt) === Date.parse(paidAt) ? "pay" : "already_paid";
  }
  if (invoice.status === "void") return "void";
  if (invoice.totalCents !== chargedCents) return "amount";
  return "pay";
}

const CARD_BRANDS: Record<string, string> = {
  amex: "American Express",
  cartes_bancaires: "Cartes Bancaires",
  diners: "Diners Club",
  discover: "Discover",
  eftpos_au: "eftpos",
  jcb: "JCB",
  mastercard: "Mastercard",
  unionpay: "UnionPay",
  visa: "Visa",
};

/**
 * How the invoice says it was paid, the way a receipt does: "Visa ending in
 * 4242", "Bank transfer (ACH) · STRIPE TEST BANK ending in 6789". Null when
 * Stripe didn't say. Shared by the page and the PDF.
 */
export function paymentMethodLabel(method: PaymentMethodInfo): string | null {
  const ending = method.method_last4 ? ` ending in ${method.method_last4}` : "";
  switch (method.method_type) {
    case null:
    case undefined:
      return null;
    case "card": {
      const brand = method.method_brand
        ? (CARD_BRANDS[method.method_brand] ?? method.method_brand.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))
        : "Card";
      return `${brand}${ending}`;
    }
    case "us_bank_account": {
      const account = method.method_brand ? `${method.method_brand}${ending}` : ending ? `Account${ending}` : "";
      return account ? `Bank transfer (ACH) · ${account}` : "Bank transfer (ACH)";
    }
    case "link":
      return "Link";
    default:
      return `${method.method_type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}${ending}`;
  }
}

/** How a paid invoice was paid online, from its payments: the one that succeeded. Null when none says. */
export function invoicePaidWith(payments: (PaymentMethodInfo & Pick<InvoicePaymentRow, "status">)[] | null): string | null {
  const paid = payments?.find((p) => p.status === "succeeded");
  return paid ? paymentMethodLabel(paid) : null;
}
