"use server";

import { headers } from "next/headers";
import { requireRequestee } from "@/lib/requireRequestee";
import { syncInvoice } from "@/lib/invoiceData";
import { getInvoicePayments, moveInvoicePayment } from "@/lib/invoicePaymentData";
import { CHECKOUT_INTEGRATION_ID, CHECKOUT_TTL_MINUTES, onlinePaymentBlock } from "@/lib/invoicePayment";
import { getStripe, onlinePaymentEnabled } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

// A firm's action, so it starts with requireRequestee(): as a server action it
// can be called by anyone signed in, with any arguments. It then checks the
// case is this firm's, since it reads with the service role.

type Result = { ok: true; url: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string): Result => ({ ok: false, error });

/**
 * Where Stripe sends the firm back to. A Vercel preview shares production's
 * NEXT_PUBLIC_APP_URL, so on a preview it's the preview address the firm is
 * on: the one it clicked Pay from, where it's logged in, which may be an alias
 * rather than the deployment's own VERCEL_URL.
 *
 * The request's host is only used when it exactly matches one of this
 * preview's own addresses: VERCEL_URL, VERCEL_BRANCH_URL, or one listed in
 * PREVIEW_RETURN_HOSTS (comma-separated, e.g. an alias). Not a pattern like
 * *.vercel.app: that's a public suffix, so it matches every Vercel customer's
 * site. Anything else falls back to VERCEL_URL.
 */
async function returnUrl(): Promise<string> {
  if (process.env.VERCEL_ENV === "preview") {
    const ownHosts = [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      ...(process.env.PREVIEW_RETURN_HOSTS ?? "").split(","),
    ]
      .map((h) => h?.trim().toLowerCase())
      .filter(Boolean);
    const host = (await headers()).get("host")?.toLowerCase();
    if (host && ownHosts.includes(host)) return `https://${host}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

const BLOCKED: Record<NonNullable<ReturnType<typeof onlinePaymentBlock>>, string> = {
  paid: "This invoice is already paid.",
  void: "This invoice is void, so nothing is owed.",
  review: "We've received a payment for this invoice and are checking it. We'll be in touch.",
  processing: "A bank payment for this invoice is already on its way. It usually clears in 4 working days.",
  not_scheduled: "You can pay once your focus group is scheduled.",
  too_small: "This invoice is too small to pay online. Email us and we'll sort it out.",
};

/**
 * Opens a Stripe Checkout session for the case's invoice and returns its URL,
 * for the firm's Pay online button. Card or bank (ACH), whichever the Stripe
 * Dashboard has turned on. The webhook marks the case paid; the page Stripe
 * sends the firm back to only shows where it stands.
 *
 * One session at a time per case, so two tabs can't both pay: an open session
 * for the same amount is reused, and any other open one is expired first. The
 * database holds it to that too (one open or processing row per case,
 * 20261121), so two clicks racing each other can't both open one.
 */
export async function startInvoicePayment(caseId: string): Promise<Result> {
  const firmId = await requireRequestee();
  if (!onlinePaymentEnabled()) return fail("Online payment isn't available yet. Please pay by check.");
  if (typeof caseId !== "string" || !UUID_RE.test(caseId)) return fail("That invoice doesn't exist.");

  let data;
  let payments;
  try {
    [data, payments] = await Promise.all([syncInvoice(caseId), getInvoicePayments(caseId)]);
  } catch (err) {
    console.error("[startInvoicePayment] couldn't read the invoice:", err);
    return fail("Couldn't read the invoice. Refresh the page and try again.");
  }
  // Another firm's case reads as no case at all.
  if (!data || !data.ownerIds.includes(firmId)) return fail("That invoice doesn't exist.");
  const { invoice } = data;
  if (!invoice) return fail("This case has no invoice yet.");

  const block = onlinePaymentBlock(invoice, payments);
  if (block) return fail(BLOCKED[block]);

  const stripe = getStripe();
  const back = await returnUrl();

  try {
    for (const p of payments.filter((p) => p.status === "open")) {
      const session = await stripe.checkout.sessions.retrieve(p.stripe_checkout_session_id);
      // Reused only if it returns the firm to where it is now.
      if (
        session.status === "open" &&
        session.amount_total === invoice.totalCents &&
        session.cancel_url?.startsWith(`${back}/`) &&
        session.url
      ) {
        return { ok: true, url: session.url };
      }
      // Paid (or a bank payment started) but the webhook hasn't recorded it yet.
      if (session.status === "complete") {
        return fail("We've received your payment and are recording it. Refresh the page in a minute.");
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      await moveInvoicePayment(session.id, "expired");
    }

    const { data: invoiceRow, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("case_id", caseId)
      .maybeSingle();
    if (invoiceError) throw new Error(`Couldn't read the invoice id: ${invoiceError.message}`);

    const metadata = { case_id: caseId, invoice_number: invoice.number };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      integration_identifier: CHECKOUT_INTEGRATION_ID,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: invoice.totalCents,
            product_data: {
              name: `Invoice ${invoice.number}`,
              description: `Texas Jury Study focus group: ${invoice.caseTitle}`.slice(0, 500),
            },
          },
        },
      ],
      ...(invoice.billedTo.email ? { customer_email: invoice.billedTo.email } : {}),
      client_reference_id: caseId,
      metadata,
      payment_intent_data: { metadata, description: `Invoice ${invoice.number}` },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_MINUTES * 60,
      success_url: `${back}/invoice/${caseId}?payment=done`,
      cancel_url: `${back}/invoice/${caseId}?payment=cancelled`,
    });
    if (!session.url) throw new Error("Stripe returned a session with no URL");

    const { error: insertError } = await supabaseAdmin.from("invoice_payments").insert({
      case_id: caseId,
      invoice_id: (invoiceRow?.id as string | undefined) ?? null,
      stripe_checkout_session_id: session.id,
      amount_cents: invoice.totalCents,
      created_by: firmId,
      livemode: session.livemode,
    });
    if (insertError?.code === "23505") {
      // Another tab or click opened one a moment ago; that one stands.
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      return fail("A payment for this invoice was just started in another window. Refresh the page and try again.");
    }
    if (insertError) {
      // Without the row the webhook couldn't tie the payment to the case, so don't send them to pay.
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new Error(`Couldn't record the payment: ${insertError.message}`);
    }

    return { ok: true, url: session.url };
  } catch (err) {
    console.error("[startInvoicePayment] couldn't open Checkout:", err);
    return fail("Couldn't start the payment. Try again in a minute, or email us.");
  }
}
