import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getStripe, onlinePaymentEnabled } from "@/lib/stripe";
import { applyCheckoutEvent } from "@/lib/invoicePaymentData";

export const runtime = "nodejs";

/**
 * Stripe's webhook for invoice payments. Marks a case paid when its Checkout
 * session's money arrives: at once for a card, days later for a bank (ACH)
 * payment. The page Stripe sends the firm back to never does this, since a
 * firm can pay and close the tab.
 *
 * Subscribe the endpoint (Stripe Dashboard → Developers → Webhooks) to
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed and checkout.session.expired, and put
 * its signing secret in STRIPE_WEBHOOK_SECRET. Every request is checked
 * against it; anything unsigned is refused.
 *
 * Answers 500 when a write fails, so Stripe retries; applyCheckoutEvent is safe
 * to run again for the same event.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !onlinePaymentEnabled()) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set, or production has a test key");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // The raw body: the signature is over the exact bytes Stripe sent.
  const body = await req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.warn("[stripe-webhook] signature check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await applyCheckoutEvent(event);
    console.log(`[stripe-webhook] ${event.type} ${event.id}: ${result}`);

    const caseId = (event.data.object as { metadata?: Record<string, string> | null }).metadata?.case_id;
    if (caseId && !result.startsWith("ignored")) {
      revalidatePath(`/invoice/${caseId}`);
      revalidatePath(`/dashboard/requestee/${caseId}`);
      revalidatePath(`/dashboard/Admin/${caseId}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
