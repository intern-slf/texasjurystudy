-- =============================================================================
-- INVOICE PAYMENTS: what the firm paid with
--
-- A paid invoice says how it was paid, as a professional receipt does:
-- "Visa ending in 4242", or a bank transfer (ACH) with the bank and the
-- account's last 4. The webhook copies it from Stripe's charge onto the row
-- when the payment goes through (or, for a bank transfer, when it starts).
--
--   method_type   Stripe's payment method type: 'card', 'us_bank_account', ...
--   method_brand  the card brand ('visa'), or the bank's name
--   method_last4  the last 4 digits of the card or account; never more
--
-- All nullable: older rows, and a payment whose details Stripe didn't give,
-- just don't say. Only the last 4 digits are ever stored.
--
-- Run this BEFORE deploying the app change (the app reads these columns).
-- Safe to re-run. Run in Supabase SQL Editor; the query at the end shows the
-- result.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.invoice_payments') IS NULL THEN
    RAISE EXCEPTION 'Run 20261119_invoice_payments.sql first; nothing changed';
  END IF;
END $$;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS method_type text,
  ADD COLUMN IF NOT EXISTS method_brand text,
  ADD COLUMN IF NOT EXISTS method_last4 text;

ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_method_last4_check;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_method_last4_check CHECK (method_last4 ~ '^[0-9]{4}$');

COMMIT;

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name LIKE 'method_%'
 ORDER BY column_name;
