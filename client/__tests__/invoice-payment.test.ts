import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";
import {
  canMoveTo,
  checkoutEventOutcome,
  invoicePaidWith,
  onlinePaymentBlock,
  paymentMethodLabel,
  settleOutcome,
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
  host: { current: "app.example.com" },
  firm: { current: "firm-1" as string | null },
  enabled: { current: true },
  live: { current: false },
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
  stripeKeyIsLive: () => mocks.live.current,
  getStripe: () => mocks.stripe,
}));
vi.mock("@/lib/mail", () => ({
  sendEmail: mocks.sendEmail,
  emailWrapper: (s: string) => s,
  escHtml: (s: string) => s,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: mocks.host.current }) }));

function invoiceData({
  status = "unpaid",
  totalCents = 150000,
  ownerIds = [FIRM],
  paidAt = null as string | null,
  // Scheduled: the case holds a time, so payment is asked for.
  dueAt = "2026-11-20T05:59:00.000Z" as string | null,
} = {}) {
  return {
    invoice: {
      number: "INV-2026-0007",
      caseTitle: "Smith v. Jones",
      issuedAt: "2026-11-01T15:00:00.000Z",
      dueAt,
      paidAt,
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
    livemode: false,
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
    livemode: false,
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
  mocks.live.current = false;
  mocks.stripe.checkout.sessions.create.mockImplementation(async () => ({
    id: "cs_new",
    url: "https://checkout.stripe.com/c/pay/cs_new",
    livemode: false,
  }));
  mocks.syncInvoice.mockResolvedValue(invoiceData());
  mocks.stripe.paymentIntents.retrieve.mockResolvedValue(charged({ type: "card", card: { brand: "visa", last4: "4242" } }));
  db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [], requestee_slot_bookings: [] });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("onlinePaymentBlock", () => {
  const owed = { status: "unpaid" as const, totalCents: 150000, dueAt: "2026-10-30T04:59:00.000Z" };

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

  it("refuses an invoice whose case isn't scheduled yet: it has no due date", () => {
    expect(onlinePaymentBlock({ ...owed, dueAt: null }, [])).toBe("not_scheduled");
    // Already paid still reads as paid.
    expect(onlinePaymentBlock({ ...owed, status: "paid", dueAt: null }, [])).toBe("paid");
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

describe("settleOutcome", () => {
  const at = "2026-11-19T12:00:00.000Z";
  const invoice = (status: string, totalCents = 150000, paidAt: string | null = null) =>
    ({ status, totalCents, paidAt }) as never;

  it("pays only when the money is exactly what the invoice says now", () => {
    expect(settleOutcome(invoice("unpaid"), 150000, at)).toBe("pay");
    expect(settleOutcome(invoice("overdue"), 150000, at)).toBe("pay");
    expect(settleOutcome(invoice("unpaid", 170000), 150000, at)).toBe("amount");
    expect(settleOutcome(invoice("unpaid", 120000), 150000, at)).toBe("amount");
  });

  it("sends a payment on a paid, void or missing invoice for review", () => {
    expect(settleOutcome(invoice("paid", 150000, "2026-11-18T09:00:00.000Z"), 150000, at)).toBe("already_paid");
    expect(settleOutcome(invoice("void"), 150000, at)).toBe("void");
    expect(settleOutcome(null, 150000, at)).toBe("no_invoice");
  });

  it("knows a retry of the payment that already paid it", () => {
    expect(settleOutcome(invoice("paid", 150000, "2026-11-19T12:00:00+00:00"), 150000, at)).toBe("pay");
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
      {
        case_id: CASE_ID,
        invoice_id: "inv-1",
        stripe_checkout_session_id: "cs_new",
        amount_cents: 150000,
        created_by: FIRM,
        livemode: false,
      },
    ]);
  });

  it("lets only one of two racing clicks open a session", async () => {
    // The other click's row lands between our check and our insert.
    mocks.stripe.checkout.sessions.create.mockImplementation(async () => {
      db.rows("invoice_payments").push(payment({ stripe_checkout_session_id: "cs_other" }));
      return { id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new", livemode: false };
    });

    expect(await start()).toEqual({ ok: false, error: expect.stringContaining("just started in another window") });
    expect(mocks.stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_new");
    expect(db.rows("invoice_payments").map((p) => p.stripe_checkout_session_id)).toEqual(["cs_other"]);
  });

  it("won't take another payment while one is being checked", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment({ status: "review" })] });
    expect(await start()).toEqual({ ok: false, error: expect.stringContaining("checking it") });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("sends a preview's payers back to the preview address they paid from, not the live site", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "texasjurystudy-abc123.vercel.app";
    process.env.VERCEL_BRANCH_URL = "texasjurystudy-git-feat-slf.vercel.app";
    process.env.PREVIEW_RETURN_HOSTS = "tjs-stripe-preview.vercel.app, other-alias.vercel.app";
    const backTo = async (host: string) => {
      db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [] });
      mocks.stripe.checkout.sessions.create.mockClear();
      mocks.host.current = host;
      await start();
      const params = mocks.stripe.checkout.sessions.create.mock.calls[0][0];
      expect(params.cancel_url).toBe(params.success_url.replace("payment=done", "payment=cancelled"));
      return params.success_url.replace(`/invoice/${CASE_ID}?payment=done`, "");
    };
    try {
      // Its own addresses, where the firm is logged in.
      expect(await backTo("tjs-stripe-preview.vercel.app")).toBe("https://tjs-stripe-preview.vercel.app");
      expect(await backTo("texasjurystudy-git-feat-slf.vercel.app")).toBe("https://texasjurystudy-git-feat-slf.vercel.app");
      expect(await backTo("texasjurystudy-abc123.vercel.app")).toBe("https://texasjurystudy-abc123.vercel.app");
      // Anything else, even another *.vercel.app site, gets the deployment's own address.
      expect(await backTo("someone-else.vercel.app")).toBe("https://texasjurystudy-abc123.vercel.app");
      expect(await backTo("evil.example.com")).toBe("https://texasjurystudy-abc123.vercel.app");
    } finally {
      delete process.env.VERCEL_ENV;
      delete process.env.VERCEL_URL;
      delete process.env.VERCEL_BRANCH_URL;
      delete process.env.PREVIEW_RETURN_HOSTS;
      mocks.host.current = "app.example.com";
    }
  });

  it("refuses another firm's case without touching Stripe", async () => {
    mocks.syncInvoice.mockResolvedValue(invoiceData({ ownerIds: ["someone-else"] }));
    expect(await start()).toEqual({ ok: false, error: "That invoice doesn't exist." });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses before the case is scheduled, without touching Stripe", async () => {
    mocks.syncInvoice.mockResolvedValue(invoiceData({ dueAt: null }));
    expect(await start()).toEqual({ ok: false, error: "You can pay once your focus group is scheduled." });
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
      cancel_url: `https://app.example.com/invoice/${CASE_ID}?payment=cancelled`,
      url: "https://checkout.stripe.com/c/pay/cs_old",
    });

    expect(await start()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_old" });
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("opens a new session rather than reuse one that would return the firm to another address", async () => {
    db.reset({ invoices: [{ id: "inv-1", case_id: CASE_ID }], invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_old",
      status: "open",
      amount_total: 150000,
      cancel_url: `https://texasjurystudy-old.vercel.app/invoice/${CASE_ID}?payment=cancelled`,
      url: "https://checkout.stripe.com/c/pay/cs_old",
    });

    expect((await start()).ok).toBe(true);
    expect(mocks.stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
    expect(mocks.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
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

  it("holds a payment that no longer matches the invoice for review, and leaves the case unpaid", async () => {
    // Checkout opened at a discount; the discount was removed before paying.
    db.reset({ invoice_payments: [payment({ amount_cents: 120000 })], requestee_slot_bookings: [] });

    expect(await apply("checkout.session.completed", { payment_status: "paid", amount_total: 120000 })).toBe(
      "review (amount)"
    );
    expect(db.rows("invoice_payments")[0]).toMatchObject({ status: "review", amount_cents: 120000, succeeded_at: null });
    expect(db.rows("requestee_slot_bookings")).toEqual([]);
    const mail = (mocks.sendEmail.mock.calls[0] as unknown as [{ subject: string; html: string }])[0];
    expect(mail.subject).toContain("Check this payment");
    expect(mail.html).toContain("not</strong> been marked paid");
    expect(mail.html).toContain("$1,500.00");
  });

  it("holds a bank payment for review when the case changed while it cleared", async () => {
    db.reset({ invoice_payments: [payment({ status: "processing" })], requestee_slot_bookings: [] });
    mocks.syncInvoice.mockResolvedValue(invoiceData({ totalCents: 190000 }));

    expect(await apply("checkout.session.async_payment_succeeded", { payment_status: "paid" })).toBe("review (amount)");
    expect(db.rows("requestee_slot_bookings")).toEqual([]);
  });

  it("holds a second payment for an invoice already paid by hand", async () => {
    db.reset({
      invoice_payments: [payment()],
      requestee_slot_bookings: [{ case_id: CASE_ID, paid_at: "2026-11-18T09:00:00.000Z", paid_by: "admin-1" }],
    });
    mocks.syncInvoice.mockResolvedValue(invoiceData({ status: "paid", paidAt: "2026-11-18T09:00:00.000Z" }));

    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("review (already_paid)");
    expect(db.rows("requestee_slot_bookings")[0]).toMatchObject({ paid_by: "admin-1" });
  });

  it("holds a payment on a void invoice for review", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });
    mocks.syncInvoice.mockResolvedValue(invoiceData({ status: "void" }));
    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("review (void)");
  });

  it("ignores a sandbox event while running live, and a live one while in the sandbox", async () => {
    db.reset({ invoice_payments: [payment()], requestee_slot_bookings: [] });

    mocks.live.current = true;
    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("ignored (test/live mismatch)");
    mocks.live.current = false;
    const live = { ...event("checkout.session.completed", { payment_status: "paid" }), livemode: true };
    const { applyCheckoutEvent } = await import("@/lib/invoicePaymentData");
    expect(await applyCheckoutEvent(live as never)).toBe("ignored (test/live mismatch)");

    expect(db.rows("invoice_payments")[0].status).toBe("open");
    expect(db.rows("requestee_slot_bookings")).toEqual([]);
  });

  it("ignores an event whose mode doesn't match the payment's own", async () => {
    db.reset({ invoice_payments: [payment({ livemode: true })], requestee_slot_bookings: [] });
    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("ignored (test/live mismatch)");
    expect(db.rows("requestee_slot_bookings")).toEqual([]);
  });

  it("closes the case's other open payment pages once it's paid", async () => {
    db.reset({
      invoice_payments: [payment(), payment({ id: "pay-2", stripe_checkout_session_id: "cs_tab2", status: "expired" })],
      requestee_slot_bookings: [],
    });
    // The database keeps it to one open page per case; this one is from before that rule.
    db.rows("invoice_payments")[1].status = "open";
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_tab2", status: "open" });

    expect(await apply("checkout.session.completed", { payment_status: "paid" })).toBe("paid");
    expect(mocks.stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_tab2");
    expect(db.rows("invoice_payments").find((p) => p.id === "pay-2")?.status).toBe("expired");
  });
});

describe("closeOpenPayments", () => {
  async function close() {
    const { closeOpenPayments } = await import("@/lib/invoicePaymentData");
    return closeOpenPayments(CASE_ID);
  }

  it("expires a payment page left open, so it can't be paid at the old amount", async () => {
    db.reset({ invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_old", status: "open" });

    expect(await close()).toBe("clear");
    expect(mocks.stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
    expect(db.rows("invoice_payments")[0].status).toBe("expired");
  });

  it("says money is on its way: a bank payment clearing, or a page paid but not yet recorded", async () => {
    db.reset({ invoice_payments: [payment({ status: "processing" })] });
    expect(await close()).toBe("in_flight");

    db.reset({ invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_old", status: "complete" });
    expect(await close()).toBe("in_flight");
    expect(db.rows("invoice_payments")[0].status).toBe("open");
  });

  it("catches a firm finishing payment just as the page is closed", async () => {
    db.reset({ invoice_payments: [payment()] });
    mocks.stripe.checkout.sessions.retrieve
      .mockResolvedValueOnce({ id: "cs_old", status: "open" })
      .mockResolvedValueOnce({ id: "cs_old", status: "complete" });
    mocks.stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error("session is not open"));
    expect(await close()).toBe("in_flight");
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
