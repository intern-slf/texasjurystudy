-- =============================================================================
-- INVOICE PAYMENTS: guards against paying the wrong amount, twice, or in test
--
--   * status 'review': money arrived but didn't mark the case paid, because it
--     isn't what the invoice says now (the case changed after Checkout
--     opened), or the invoice was already paid or void. The case stays unpaid
--     and info@ is emailed to sort it out (Mark paid, or refund in Stripe).
--
--   * One open or processing payment per case (a partial unique index), so two
--     clicks or tabs racing each other can't both open a Checkout session.
--
--   * livemode: whether the session was made with a live key. The webhook
--     ignores an event whose mode doesn't match the row's, so a sandbox
--     payment can't mark a real case paid. Every row so far was made in the
--     sandbox, so they're set false.
--
-- Run this BEFORE deploying the app change (the app writes livemode and
-- 'review'). Safe to re-run. Run in Supabase SQL Editor; the query at the end
-- shows the result.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.invoice_payments') IS NULL THEN
    RAISE EXCEPTION 'Run 20261119_invoice_payments.sql first; nothing changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_payments
     WHERE status IN ('open', 'processing') AND case_id IS NOT NULL
     GROUP BY case_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A case has more than one open or processing payment; sort those rows out first. Nothing changed';
  END IF;
END $$;

ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_status_check;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_status_check
  CHECK (status IN ('open', 'processing', 'succeeded', 'failed', 'expired', 'review'));

CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_one_in_flight_idx
  ON public.invoice_payments (case_id)
  WHERE status IN ('open', 'processing');

ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS livemode boolean;
UPDATE public.invoice_payments SET livemode = false WHERE livemode IS NULL;
ALTER TABLE public.invoice_payments ALTER COLUMN livemode SET DEFAULT false;
ALTER TABLE public.invoice_payments ALTER COLUMN livemode SET NOT NULL;

COMMIT;

SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'invoice_payments_status_check') AS status_check,
  (SELECT indexdef FROM pg_indexes WHERE indexname = 'invoice_payments_one_in_flight_idx') AS one_in_flight,
  (SELECT count(*) FROM public.invoice_payments WHERE livemode) AS live_rows,
  (SELECT count(*) FROM public.invoice_payments WHERE NOT livemode) AS test_rows;
