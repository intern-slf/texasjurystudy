import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";
import {
  canMoveTo,
  checkoutEventOutcome,
  invoicePaidWith,
  onlinePaymentBlock,
  paymentMethodLabel,
} from "@/lib/invoicePayment";

/* ---------------------------------------------------------------------------
   Paying an invoice online with Stripe Checkout: the rules (lib/invoicePayment),
   the firm's action that opens Checkout (lib/actions/requesteeInvoicePayment),
   the webhook's bookkeeping (applyCheckoutEvent in lib/invoicePaymentData) and
   the webhook route's signature check (app/api/stripe/webhook).
--------------------------------------------------------------------------- */

const CASE_ID = "3f9a12bc-1d2e-4f50-8a6b-7c8d9e0f1a2b";
const FIRM = "firm-1";

const db = new FakeDb();

const mocks = vi.hoisted(() => ({
  firm: { current: "firm-1" as string | null },
  enabled: { current: true },
  syncInvoice: vi.fn(),
  sendEmail: vi.fn(async () => ({ attachments: 0 })),
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
        expire: vi.fn(async () => ({})),
      },
    },
    paymentIntents: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  },
}));

vi.mock("@/lib/requireRequestee", () => ({
  requireRequestee: async () => {
    if (!mocks.firm.current) throw new Error("Not authorized");
    return mocks.firm.current;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: (t: string) => db.from(t) } }));
vi.mock("@/lib/invoiceData", () => ({ syncInvoice: mocks.syncInvoice }));
vi.mock("@/lib/stripe", () => ({
  onlinePaymentEnabled: () => mocks.enabled.current,
  getStripe: () => mocks.stripe,
}));
vi.mock("@/lib/mail", () => ({
  sendEmail: mocks.sendEmail,
  emailWrapper: (s: string) => s,
  escHtml: (s: string) => s,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function invoiceData({ status = "unpaid", totalCents = 150000, ownerIds = [FIRM] } = {}) {
  return {
    invoice: {
      number: "INV-2026-0007",
      caseTitle: "Smith v. Jones",
      issuedAt: "2026-11-01T15:00:00.000Z",
      dueAt: null,
      paidAt: null,
      status,
      billedTo: { name: "Jane Doe", email: "jane@firm.com" },
      lines: [],
      totalCents,
    },
    ownerIds,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    case_id: CASE_ID,
    invoice_id: "inv-1",
    stripe_checkout_session_id: "cs_old",
    stripe_payment_intent_id: null,
    amount_cents: 150000,
    status: "open",
    created_at: "2026-11-19T10:00:00.000Z",
    succeeded_at: null,
    method_type: null,
    method_brand: null,
    method_last4: null,
    ...overrides,
  };
}

function event(type: string, session: Record<string, unknown>) {
  return {
    id: "evt_1",
    type,
    created: Date.parse("2026-11-19T12:00:00.000Z") / 1000,
    data: { object: { id: "cs_old", metadata: { case_id: CASE_ID }, amount_total: 150000, ...session } },
  };
}

/** A PaymentIntent whose charge was made with `details`. */
function charged(details: Record<string, unknown>) {
  return { id: "pi_1", latest_charge: { id: "ch_1", payment_method_details: details } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.firm.current = FIRM;
  mocks.enabled.current = true;
  mocks.syncInvoice.mockResolvedValue(invoiceData());
  mocks.stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new" });
  mocks.stripe.paymentIntents.retrieve.mockResolvedValue(charged({ type: "card", card: { brand: "visa", last4: "4242" } }));
  db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [], requestee_slot_bookings: [] });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("onlinePaymentBlock", () => {
  const owed = { status: "unpaid" as const, totalCents: 150000 };

  it("lets an unpaid or overdue invoice be paid", () => {
    expect(onlinePaymentBlock(owed, [])).toBeNull();
    expect(onlinePaymentBlock({ ...owed, status: "overdue" }, [{ status: "expired" }, { status: "failed" }])).toBeNull();
  });

  it("refuses a paid, void, in-flight or sub-50-cent invoice", () => {
    expect(onlinePaymentBlock({ ...owed, status: "paid" }, [])).toBe("paid");
    expect(onlinePaymentBlock(owed, [{ status: "succeeded" }])).toBe("paid");
    expect(onlinePaymentBlock({ ...owed, status: "void" }, [])).toBe("void");
    expect(onlinePaymentBlock(owed, [{ status: "processing" }])).toBe("processing");
    expect(onlinePaymentBlock({ ...owed, totalCents: 49 }, [])).toBe("too_small");
  });
});

describe("checkoutEventOutcome", () => {
  it("marks paid only when the money has arrived", () => {
    expect(checkoutEventOutcome("checkout.session.completed", "paid")).toBe("paid");
    expect(checkoutEventOutcome("checkout.session.completed", "unpaid")).toBe("processing");
    expect(checkoutEventOutcome("checkout.session.async_payment_succeeded", "paid")).toBe("paid");
    expect(checkoutEventOutcome("checkout.session.async_payment_failed", "unpaid")).toBe("failed");
    expect(checkoutEventOutcome("checkout.session.expired", "unpaid")).toBe("expired");
    expect(checkoutEventOutcome("payment_intent.succeeded", "paid")).toBeNull();
  });

  it("never moves a row backwards", () => {
    expect(canMoveTo("expired")).not.toContain("succeeded");
    expect(canMoveTo("failed")).not.toContain("succeeded");
    expect(canMoveTo("processing")).toEqual(["open"]);
  });
});

describe("paymentMethodLabel", () => {
  const method = (method_type: string | null, method_brand: string | null = null, method_last4: string | null = null) => ({
    method_type,
    method_brand,
    method_last4,
  });

  it("names a card by its brand and last 4, as a receipt does", () => {
    expect(paymentMethodLabel(method("card", "visa", "4242"))).toBe("Visa ending in 4242");
    expect(paymentMethodLabel(method("card", "amex", "0005"))).toBe("American Express ending in 0005");
    expect(paymentMethodLabel(method("card", "some_new_brand", "1111"))).toBe("Some new brand ending in 1111");
    expect(paymentMethodLabel(method("card"))).toBe("Card");
  });

  it("names a bank transfer, with the bank and account's last 4 when Stripe gives them", () => {
    expect(paymentMethodLabel(method("us_bank_account", "STRIPE TEST BANK", "6789"))).toBe(
      "Bank transfer (ACH) · STRIPE TEST BANK ending in 6789"
    );
    expect(paymentMethodLabel(method("us_bank_account", null, "6789"))).toBe("Bank transfer (ACH) · Account ending in 6789");
    expect(paymentMethodLabel(method("us_bank_account"))).toBe("Bank transfer (ACH)");
  });

  it("says nothing when it doesn't know", () => {
    expect(paymentMethodLabel(method(null))).toBeNull();
    expect(paymentMethodLabel(method("link"))).toBe("Link");
  });

  it("takes the payment that succeeded", () => {
    expect(
      invoicePaidWith([
        { status: "expired", ...method("card", "mastercard", "4444") },
        { status: "succeeded", ...method("card", "visa", "4242") },
      ])
    ).toBe("Visa ending in 4242");
    expect(invoicePaidWith([{ status: "processing", ...method("us_bank_account", "BANK", "6789") }])).toBeNull();
    expect(invoicePaidWith(null)).toBeNull();
  });
});

describe("startInvoicePayment", () => {
  async function start() {
    const { startInvoicePayment } = await import("@/lib/actions/requesteeInvoicePayment");
    return startInvoicePayment(CASE_ID);
  }

  it("opens Checkout for the invoice total and records the session", async () => {
    const result = await start();

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_new" });
    const params = mocks.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data.unit_amount).toBe(150000);
    expect(params.metadata).toEqual({ case_id: CASE_ID, invoice_number: "INV-2026-0007" });
    expect(params.customer_email).toBe("jane@firm.com");
    expect(params.success_url).toBe(`https://app.example.com/invoice/${CASE_ID}?payment=done`);
    // Dynamic payment methods: card and ACH come from the Dashboard, not the code.
    expect(params).not.toHaveProperty("payment_method_types");
    expect(db.rows("invoice_payments")).toMatchObject([
      { case_id: CASE_ID, invoice_id: "inv-1", stripe_checkout_session_id: "cs_new", amount_cents: 150000, created_by: FIRM },
    ]);
  });

  it("sends a preview's payers back to the preview, not the live site", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "texasjurystudy-abc123.vercel.app";
    try {
      await start();
    } finally {
      delete process.env.VERCEL_ENV;
      delete process.env.VERCEL_URL;
    }
    const params = mocks.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.success_url).toBe(`https://texasjurystudy-abc123.vercel.app/invoice/${CASE_ID}?payment=done`);
  });

  it("refuses another firm's case without touching Stripe", async () => {
    mocks.syncInvoice.mockResolvedValue(invoiceData({ ownerIds: ["someone-else"] }));
    expect(await start()).toEqual({ ok: false, error: "That invoice doesn't exist." });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses while online payment is off", async () => {
    mocks.enabled.current = false;
    expect((await start()).ok).toBe(false);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses while a bank payment is processing", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment({ status: "processing" })] });
    const result = await start();
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining("already on its way") });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reuses an open session for the same amount, so two tabs can't both pay", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_old",
      status: "open",
      amount_total: 150000,
      url: "https://checkout.stripe.com/c/pay/cs_old",
    });

    expect(await start()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_old" });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("expires an open session for an old amount before opening a new one", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment({ amount_cents: 120000 })] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_old", status: "open", amount_total: 120000, url: "x" });

    expect((await start()).ok).toBe(true);
    expect(mocks.stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
    expect(db.rows("invoice_payments").map((p) => [p.stripe_checkout_session_id, p.status ?? "open"])).toEqual([
      ["cs_old", "expired"],
      ["cs_new", "open"],
    ]);
  });

  it("won't open a second session while a completed one awaits its webhook", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_old", status: "complete", amount_total: 150000 });

    expect((await start()).ok).toBe(false);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("applyCheckoutEvent", () => {
  async function apply(type: string, session: Record<string, unknown> = {}) {
    const { applyCheckoutEvent } = await import("@/lib/invoicePaymentData");
    return applyCheckoutEvent(event(type, session) as never);
  }

  it("marks the case paid when a card payment completes, and tells info@", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [{ case_id: CASE_ID, slot_id: "slot-1", held_since: "x", paid_at: null }] });

    expect(await apply("checkout.session.completed", { payment_status: "paid", payment_intent: "pi_1" })).toBe("paid");
    expect(db.rows("requestee_slot_bookings")[0]).toMatchObject({ paid_at: "2026-11-19T12:00:00.000Z", paid_by: null, slot_id: "slot-1" });
    expect(db.rows("invoice_payments")[0]).toMatchObject({ status: "succeeded", stripe_payment_intent_id: "pi_1" });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("records a paid case with no time held as a slot-less booking", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });

    await apply("checkout.session.completed", { payment_status: "paid" });
    expect(db.rows("requestee_slot_bookings")).toMatchObject([{ case_id: CASE_ID, paid_at: "2026-11-19T12:00:00.000Z" }]);
  });

  it("waits for a bank payment to clear before marking paid", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });

    expect(await apply("checkout.session.completed", { payment_status: "unpaid" })).toBe("processing");
    expect(db.rows("requestee_slot_bookings")).toEqual([]);

    expect(await apply("checkout.session.async_payment_succeeded", { payment_status: "paid" })).toBe("paid");
    expect(db.rows("requestee_slot_bookings")).toHaveLength(1);
  });

  it("records a bounced bank payment and leaves the case unpaid", async () => {
    db.reset({ invoice_payments: [payment({ status: "processing" })], requestee_slot_bookings: [] });

    expect(await apply("checkout.session.async_payment_failed")).toBe("failed");
    expect(db.rows("invoice_payments")[0].status).toBe("failed");
    expect(db.rows("requestee_slot_bookings")).toEqual([]);
  });

  it("is safe to replay, and ignores sessions that aren't ours", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    await apply("checkout.session.completed", { payment_status: "paid" });
    mocks.sendEmail.mockClear();

    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("already paid");
    expect(await apply("checkout.session.expired")).toBe("no change (succeeded)");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(db.rows("requestee_slot_bookings")).toHaveLength(1);

    expect(await apply("checkout.session.completed", { id: "cs_someone_else", payment_status: "paid" })).toBe("unknown session");
  });

  it("records what the firm paid with, and tells info@", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });

    await apply("checkout.session.completed", { payment_status: "paid", payment_intent: "pi_1" });
    expect(mocks.stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] });
    expect(db.rows("invoice_payments")[0]).toMatchObject({ method_type: "card", method_brand: "visa", method_last4: "4242" });
    const mail = (mocks.sendEmail.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(mail.html).toContain("Paid with Visa ending in 4242");
  });

  it("records the bank and account's last 4 as soon as a bank payment starts", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue(
      charged({ type: "us_bank_account", us_bank_account: { bank_name: "STRIPE TEST BANK", last4: "6789" } })
    );

    await apply("checkout.session.completed", { payment_status: "unpaid", payment_intent: "pi_1" });
    expect(db.rows("invoice_payments")[0]).toMatchObject({
      status: "processing",
      method_type: "us_bank_account",
      method_brand: "STRIPE TEST BANK",
      method_last4: "6789",
    });
  });

  it("still marks the case paid when Stripe can't say what it was paid with", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    mocks.stripe.paymentIntents.retrieve.mockRejectedValue(new Error("Stripe is down"));

    expect(await apply("checkout.session.completed", { payment_status: "paid", payment_intent: "pi_1" })).toBe("paid");
    expect(db.rows("invoice_payments")[0]).toMatchObject({ status: "succeeded", method_type: null });
    expect(db.rows("requestee_slot_bookings")).toHaveLength(1);
  });

  it("keeps only a last 4 that is 4 digits", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue(charged({ type: "card", card: { brand: "visa", last4: "42424242" } }));

    await apply("checkout.session.completed", { payment_status: "paid", payment_intent: "pi_1" });
    expect(db.rows("invoice_payments")[0]).toMatchObject({ method_brand: "visa", method_last4: null });
  });

  it("flags a payment that no longer matches a revised invoice", async () => {
    db.reset({ invoice_payments: [payment({ amount_cents: 120000 })], requestee_slot_bookings: [] });

    await apply("checkout.session.completed", { payment_status: "paid", amount_total: 120000 });
    const mail = (mocks.sendEmail.mock.calls[0] as unknown as [{ html: string }])[0];
    expect(mail.html).toContain("Check this one");
  });
});

describe("the webhook route", () => {
  async function post(signature: string | null) {
    process.env.STRIPE_SECRET_KEY = "rk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const headers = new Headers(signature ? { "stripe-signature": signature } : {});
    return POST(new Request("https://app.example.com/api/stripe/webhook", { method: "POST", body: "{}", headers }) as never);
  }

  it("refuses a request with no signature or a bad one", async () => {
    expect((await post(null)).status).toBe(400);

    mocks.stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    expect((await post("t=1,v1=bad")).status).toBe(400);
  });

  it("applies a verified event", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    mocks.stripe.webhooks.constructEvent.mockReturnValue(event("checkout.session.completed", { payment_status: "paid" }));

    expect((await post("t=1,v1=good")).status).toBe(200);
    expect(db.rows("invoice_payments")[0].status).toBe("succeeded");
  });
});
