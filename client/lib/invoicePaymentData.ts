import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncInvoice } from "@/lib/invoiceData";
import type { InvoiceView } from "@/lib/invoice";
import { emailWrapper, escHtml, sendEmail } from "@/lib/mail";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { formatCents } from "@/lib/receipt-pricing";
import { getStripe, onlinePaymentEnabled, stripeKeyIsLive } from "@/lib/stripe";
import {
  canMoveTo,
  checkoutEventOutcome,
  paymentMethodLabel,
  settleOutcome,
  type InvoicePaymentRow,
  type InvoicePaymentStatus,
  type PaymentMethodInfo,
  type ReviewReason,
} from "@/lib/invoicePayment";

/**
 * public.invoice_payments (20261119_invoice_payments.sql), with the service
 * role. Not a server action, so nothing here can be called from a browser; the
 * firm's action checks the case is theirs, and the webhook checks Stripe's
 * signature, before calling in.
 */

const PAYMENT_COLUMNS =
  "id, case_id, invoice_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, livemode, status, created_at, succeeded_at, method_type, method_brand, method_last4";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Every online payment opened for the case, newest first. Throws when the read fails. */
export async function getInvoicePayments(caseId: string): Promise<InvoicePaymentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("invoice_payments")
    .select(PAYMENT_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't read the case's payments: ${error.message}`);
  return (data ?? []) as InvoicePaymentRow[];
}

/** Moves a row to `next`, only from a status that allows it. Returns the row if it moved, null if not. */
export async function moveInvoicePayment(
  sessionId: string,
  next: InvoicePaymentStatus,
  changes: Partial<Pick<InvoicePaymentRow, "stripe_payment_intent_id" | "amount_cents" | "succeeded_at">> &
    Partial<PaymentMethodInfo> = {}
): Promise<InvoicePaymentRow | null> {
  const { data, error } = await supabaseAdmin
    .from("invoice_payments")
    .update({ status: next, updated_at: new Date().toISOString(), ...changes })
    .eq("stripe_checkout_session_id", sessionId)
    .in("status", canMoveTo(next))
    .select(PAYMENT_COLUMNS);
  if (error) throw new Error(`Couldn't update the payment: ${error.message}`);
  return ((data ?? [])[0] as InvoicePaymentRow | undefined) ?? null;
}

/**
 * What the firm paid with, from the payment's charge: the card brand or bank,
 * and the last 4 digits. Empty when there's no charge yet or Stripe can't be
 * reached: it's only for the invoice to show, so it never holds up recording
 * the payment.
 */
export async function readPaymentMethod(paymentIntentId: string | null): Promise<Partial<PaymentMethodInfo>> {
  if (!paymentIntentId) return {};
  try {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const details = charge?.payment_method_details;
    if (!details) return {};
    const last4 = (s: string | null | undefined) => (s && /^[0-9]{4}$/.test(s) ? s : null);
    if (details.card) {
      return { method_type: "card", method_brand: details.card.brand ?? null, method_last4: last4(details.card.last4) };
    }
    if (details.us_bank_account) {
      return {
        method_type: "us_bank_account",
        method_brand: details.us_bank_account.bank_name ?? null,
        method_last4: last4(details.us_bank_account.last4),
      };
    }
    return { method_type: details.type, method_brand: null, method_last4: null };
  } catch (err) {
    console.error("[invoicePayment] couldn't read how the payment was made:", err);
    return {};
  }
}

/**
 * Marks the case paid, as an admin's Mark paid does (requestee_slot_bookings.paid_at),
 * with no paid_by. Brings the invoice up to date first, as Mark paid does, since a
 * paid invoice is frozen. Inserts a slot-less row for a case that holds no time.
 * Does nothing if it's already paid. Throws when a write fails.
 */
export async function markCasePaidOnline(caseId: string, paidAt: string): Promise<void> {
  try {
    await syncInvoice(caseId);
  } catch (err) {
    // The payment is real either way; the invoice page catches up when opened.
    console.error("[markCasePaidOnline] couldn't bring the invoice up to date:", err);
  }

  const update = () =>
    supabaseAdmin
      .from("requestee_slot_bookings")
      .update({ paid_at: paidAt, paid_by: null, updated_at: paidAt })
      .eq("case_id", caseId)
      .is("paid_at", null)
      .select("case_id");

  const first = await update();
  if (first.error) throw new Error(`Couldn't mark the case paid: ${first.error.message}`);
  if (first.data?.length) return;

  const { data: existing, error: readError } = await supabaseAdmin
    .from("requestee_slot_bookings")
    .select("case_id")
    .eq("case_id", caseId)
    .maybeSingle();
  if (readError) throw new Error(`Couldn't read the booking: ${readError.message}`);
  if (existing) return; // already paid

  const insert = await supabaseAdmin
    .from("requestee_slot_bookings")
    .insert({ case_id: caseId, paid_at: paidAt, updated_at: paidAt });
  if (!insert.error) return;
  // A booking appeared in between (the firm took a time just now): mark that one.
  if (insert.error.code === "23505") {
    const retry = await update();
    if (retry.error) throw new Error(`Couldn't mark the case paid: ${retry.error.message}`);
    return;
  }
  throw new Error(`Couldn't mark the case paid: ${insert.error.message}`);
}

/**
 * Expires the case's open Checkout sessions (all but `keep`), so a payment
 * page left open in another tab can't be paid once the case is paid or its
 * amount is about to change. Returns `in_flight` when money is already on its
 * way: a bank payment processing, or a session paid whose webhook hasn't been
 * recorded yet. Throws when Stripe or the database can't be reached.
 */
export async function closeOpenPayments(caseId: string, keep?: string): Promise<"clear" | "in_flight"> {
  const payments = (await getInvoicePayments(caseId)).filter((p) => p.stripe_checkout_session_id !== keep);
  let inFlight = payments.some((p) => p.status === "processing");
  const open = payments.filter((p) => p.status === "open");
  if (!open.length) return inFlight ? "in_flight" : "clear";
  // Online payment turned off since: nothing here can expire them, so treat them as under way.
  if (!onlinePaymentEnabled()) return "in_flight";

  const stripe = getStripe();
  for (const p of open) {
    const id = p.stripe_checkout_session_id;
    let session = await stripe.checkout.sessions.retrieve(id);
    if (session.status === "open") {
      try {
        await stripe.checkout.sessions.expire(id);
      } catch (err) {
        // The firm finished paying between the two calls.
        session = await stripe.checkout.sessions.retrieve(id);
        if (session.status !== "complete") throw err;
      }
    }
    if (session.status === "complete") inFlight = true;
    else await moveInvoicePayment(id, "expired");
  }
  return inFlight ? "in_flight" : "clear";
}

/** closeOpenPayments, for after the case is settled: only logs a failure, since nothing is waiting on it. */
export async function closeOpenPaymentsQuietly(caseId: string, keep?: string): Promise<void> {
  try {
    await closeOpenPayments(caseId, keep);
  } catch (err) {
    console.error("[invoicePayment] couldn't close the case's other open payments:", err);
  }
}

/**
 * Applies a verified Checkout webhook event. Returns what it did, for the log.
 * Safe to run twice for the same event: rows only move forward, and paying an
 * already-paid case changes nothing. Throws on a failed write, so the webhook
 * answers 500 and Stripe retries.
 *
 * Money only marks the case paid when it's exactly what the invoice says now
 * (settleOutcome). Otherwise the row goes to `review`, the case stays unpaid,
 * and info@ is told why.
 */
export async function applyCheckoutEvent(event: Stripe.Event): Promise<string> {
  const outcome = checkoutEventOutcome(event.type, (event.data.object as { payment_status?: string }).payment_status);
  if (!outcome) return "ignored";
  // A sandbox event never touches a live payment, nor a live one a sandbox's.
  if (event.livemode !== stripeKeyIsLive()) return "ignored (test/live mismatch)";
  const session = event.data.object as Stripe.Checkout.Session;

  const { data: row, error } = await supabaseAdmin
    .from("invoice_payments")
    .select(PAYMENT_COLUMNS)
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the payment: ${error.message}`);
  // Not one of ours (another integration on the account), or its case is gone.
  if (!row) return "unknown session";
  const payment = row as InvoicePaymentRow;
  if (payment.livemode !== event.livemode) return "ignored (test/live mismatch)";

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  // A bank transfer has its charge (and so its bank and last 4) from the start.
  const method = outcome === "paid" || outcome === "processing" ? await readPaymentMethod(paymentIntentId) : {};

  if (outcome === "paid") {
    const paidAt = new Date(event.created * 1000).toISOString();
    const charged = session.amount_total ?? payment.amount_cents;
    const settled = { stripe_payment_intent_id: paymentIntentId, amount_cents: charged, ...method };

    // The invoice as it stands now: the case may have changed since Checkout opened.
    const invoice = payment.case_id ? ((await syncInvoice(payment.case_id))?.invoice ?? null) : null;
    const verdict = settleOutcome(invoice, charged, paidAt);

    if (verdict !== "pay") {
      const moved = await moveInvoicePayment(session.id, "review", settled);
      if (moved) await notifyAdminQuietly(moved, verdict, invoice);
      if (payment.case_id) await closeOpenPaymentsQuietly(payment.case_id, session.id);
      return moved ? `review (${verdict})` : `no change (${payment.status})`;
    }

    const caseId = payment.case_id!;
    // The case first: if this fails, the row stays unpaid and Stripe's retry does both.
    await markCasePaidOnline(caseId, paidAt);
    const moved = await moveInvoicePayment(session.id, "succeeded", { ...settled, succeeded_at: paidAt });
    if (moved) await notifyAdminQuietly(moved, "paid", invoice);
    await closeOpenPaymentsQuietly(caseId, session.id);
    return moved ? "paid" : "already paid";
  }

  const moved = await moveInvoicePayment(session.id, outcome, { stripe_payment_intent_id: paymentIntentId, ...method });
  if (moved && outcome === "failed") await notifyAdminQuietly(moved, "failed", null);
  return moved ? outcome : `no change (${payment.status})`;
}

/** What info@ is told when money arrived but didn't mark the case paid. */
function reviewText(reason: ReviewReason, paid: string, owed: string | null): string {
  switch (reason) {
    case "amount":
      return `The firm paid ${paid}, but the invoice now says ${owed}: the case changed after they opened the payment page (a discount, hours or filters). Mark it paid if that's fine, or refund the payment in Stripe and ask them to pay again.`;
    case "already_paid":
      return `The invoice was already marked paid, so this may be a second payment. If so, refund it in Stripe.`;
    case "void":
      return `The invoice is void, so nothing was owed. Refund the payment in Stripe.`;
    case "no_invoice":
      return `The case or its invoice no longer exists. Match the payment up by hand, or refund it in Stripe.`;
  }
}

/**
 * Tells info@ that money arrived, that a payment needs checking before the
 * case counts as paid, or that a bank payment bounced. Only logs a failure:
 * the payment is recorded either way.
 */
async function notifyAdminQuietly(
  payment: InvoicePaymentRow,
  kind: "paid" | "failed" | ReviewReason,
  invoice: InvoiceView | null
): Promise<void> {
  try {
    const title = invoice?.caseTitle ?? "a case";
    const invoiceLine = invoice
      ? `Invoice ${escHtml(invoice.number)}, billed to ${escHtml(invoice.billedTo.name)}.`
      : "";
    const amount = formatCents(payment.amount_cents);
    const method = paymentMethodLabel(payment);
    const methodLine = method ? ` Paid with ${escHtml(method)}.` : "";

    const link = payment.case_id
      ? `<p style="margin:0;font-size:14px;"><a href="${appUrl()}/invoice/${encodeURIComponent(payment.case_id)}" style="color:#1e3a8a;">Open the invoice</a></p>`
      : "";

    const [subject, heading, text] =
      kind === "paid"
        ? [
            `Paid online: ${amount} for ${title}`,
            "Invoice paid online",
            `Stripe received <strong>${amount}</strong> for <strong>${escHtml(title)}</strong>. The case is now marked paid.`,
          ]
        : kind === "failed"
          ? [
              `Bank payment failed: ${title}`,
              "A bank payment failed",
              `The bank payment of <strong>${amount}</strong> for <strong>${escHtml(title)}</strong> did not go through. The invoice is still unpaid, and the firm can try again from it.`,
            ]
          : [
              `Check this payment: ${amount} for ${title}`,
              "A payment needs checking",
              `Stripe received <strong>${amount}</strong> for <strong>${escHtml(title)}</strong>, but the case has <strong>not</strong> been marked paid. ${reviewText(
                kind,
                amount,
                invoice ? formatCents(invoice.totalCents) : null
              )}`,
            ];

    await sendEmail({
      to: SUPPORT_EMAIL,
      subject,
      html: emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e3a8a;">${heading}</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;">
          ${text}
          ${invoiceLine}${methodLine}
        </p>
        ${link}
      `),
    });
  } catch (err) {
    console.error("[invoicePayment] couldn't email the admin:", err);
  }
}
