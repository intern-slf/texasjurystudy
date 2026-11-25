import Stripe from "stripe";

/**
 * The server's Stripe client, for paying invoices online (lib/actions/
 * requesteeInvoicePayment.ts, app/api/stripe/webhook). Server-only: the key
 * must never reach a browser.
 *
 * Online payment is off until STRIPE_SECRET_KEY is set, so the app deploys
 * before Stripe is configured; the Pay button simply doesn't show. Use a
 * restricted key (rk_...) with write access to Checkout Sessions and read
 * access to PaymentIntents, not the account's secret key.
 *
 * Production only takes a live key. Previews share production's database, so
 * a test key there would let a sandbox card mark a real case paid; with one
 * set by mistake, online payment stays off and the webhook refuses events.
 */

let client: Stripe | null = null;

/** Whether the key is a live one (sk_live_/rk_live_), not a sandbox's. */
export function stripeKeyIsLive(): boolean {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "");
}

export function onlinePaymentEnabled(): boolean {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false;
  return process.env.VERCEL_ENV !== "production" || stripeKeyIsLive();
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}
