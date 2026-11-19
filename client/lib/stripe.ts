import Stripe from "stripe";

/**
 * The server's Stripe client, for paying invoices online (lib/actions/
 * requesteeInvoicePayment.ts, app/api/stripe/webhook). Server-only: the key
 * must never reach a browser.
 *
 * Online payment is off until STRIPE_SECRET_KEY is set, so the app deploys
 * before Stripe is configured; the Pay button simply doesn't show. Use a
 * restricted key (rk_...) with write access to Checkout Sessions only, not
 * the account's secret key.
 */

let client: Stripe | null = null;

export function onlinePaymentEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}
