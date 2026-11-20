-- =============================================================================
-- INVOICE PAYMENTS (Stripe)
--
-- A firm can pay its invoice online (app/invoice/[caseId] → Stripe Checkout).
-- Each Checkout session the app opens is one row here, so we know which
-- payment is in flight, which one paid, and how much Stripe actually took.
--
--   * stripe_checkout_session_id is UNIQUE: the webhook finds its row by it,
--     and a retried event can't create a second one.
--   * status:
--       open        the firm was sent to Stripe and hasn't finished
--       processing  they paid by bank (ACH); it takes a few working days to
--                   clear, and the case isn't paid until it does
--       succeeded   the money arrived; the webhook marked the case paid
--       failed      the bank payment bounced
--       expired     the session timed out, or a newer one replaced it
--   * amount_cents is what the session charges, set when it's opened. If the
--     invoice was revised between then and payment, the two differ; the
--     webhook still marks the case paid (money changed hands) and tells an
--     admin.
--
-- Paid still lives on requestee_slot_bookings.paid_at, as when an admin marks
-- it by hand: the invoice, the promo-code lock and the booking rules all read
-- it there. A successful payment sets it (inserting a slot-less row for a case
-- that holds no time, as an admin-free paid record), with paid_by NULL.
--
-- case_id and invoice_id are ON DELETE SET NULL, so the record of a payment
-- outlives its case, like the invoice does.
--
-- Admins read; only the app's server (service role) writes. Explicit grants,
-- because Supabase no longer grants new public tables automatically.
--
-- Run this BEFORE deploying the app change. Safe to re-run. Run in Supabase SQL
-- Editor; the query at the end shows the result.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'Run 20261023_invoices.sql first; nothing changed';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() is missing; nothing changed';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid,
  invoice_id uuid,
  stripe_checkout_session_id text NOT NULL,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processing', 'succeeded', 'failed', 'expired')),
  -- The firm login that started it.
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  CONSTRAINT invoice_payments_session_key UNIQUE (stripe_checkout_session_id),
  CONSTRAINT invoice_payments_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL,
  CONSTRAINT invoice_payments_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL,
  CONSTRAINT invoice_payments_succeeded_needs_time
    CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS invoice_payments_case_id_idx ON public.invoice_payments (case_id);

COMMENT ON TABLE public.invoice_payments IS
  'One row per Stripe Checkout session opened to pay a case''s invoice. Written by the app''s server and the Stripe webhook; admins read.';

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoice_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.invoice_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoice_payments TO service_role;

DROP POLICY IF EXISTS "admin can read invoice payments" ON public.invoice_payments;
CREATE POLICY "admin can read invoice payments"
  ON public.invoice_payments
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

COMMIT;

SELECT c.relname AS name, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'invoice_payments';
