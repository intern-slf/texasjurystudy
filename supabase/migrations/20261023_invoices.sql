-- =============================================================================
-- INVOICES
--
-- The invoice a law firm gets for a case (app/invoice/[caseId]). Until now the
-- page rebuilt it from the case on every view, with a number made from the
-- case id, so nothing was kept: an invoice already paid changed when its case
-- or our rates did, and two cases could, rarely, share a number. This keeps
-- each invoice once it's issued.
--
--   * invoice_number is sequential per year, in Central Time: INV-2026-0001,
--     INV-2026-0002, ... UNIQUE, so no two invoices can share one.
--   * case_id is UNIQUE: one invoice per case. ON DELETE SET NULL, so the
--     record outlives a case that is deleted outright.
--   * issued_at, billed_to_*, case_title, delivery_mode, lines and total_cents
--     are what the invoice says. The app issues it when the case is approved or
--     its firm holds a time (or the first time the invoice is opened, for a
--     case from before this), revises it while it's unpaid so it keeps matching
--     the firm's receipt, and leaves it alone once paid. Number and issue date
--     never change.
--   * voided_at: the case was rejected or archived before payment, so nothing
--     is owed. The number stays used.
--
-- Numbers come from issue_invoice(), which locks per case and per year, so two
-- requests issuing at once can't take the same number or give a case two
-- invoices. Only the service role (the app's server) may call it.
--
-- Admins can read invoices directly. Firms see theirs through the app's
-- server, which checks the case is theirs. Explicit grants, because Supabase
-- stops granting new public tables automatically on 2026-10-30.
--
-- Run this BEFORE deploying the app change. Safe to re-run. Run in Supabase SQL
-- Editor; the query at the end shows the result.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() is missing; nothing changed';
  END IF;
END $$;

-- The last number used in each year.
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0)
);

COMMENT ON TABLE public.invoice_counters IS
  'The last invoice number used in each (Central Time) year. Written only by issue_invoice().';

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  case_id uuid,
  -- The firm billed: the case's requestee_id, else its creator.
  firm_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL,
  billed_to_name text,
  billed_to_email text,
  case_title text NOT NULL,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('online', 'offline')),
  -- [{ "description", "details": [text], "quantity" (text or null), "amountCents" }]
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  revised_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number),
  CONSTRAINT invoices_case_id_key UNIQUE (case_id),
  CONSTRAINT invoices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL,
  CONSTRAINT invoices_number_format CHECK (invoice_number ~ '^INV-[0-9]{4}-[0-9]{4,}$')
);

COMMENT ON TABLE public.invoices IS
  'One invoice per case, kept once issued. Numbered by issue_invoice(); revised by the app only while unpaid. Admins read; the app''s server writes.';

CREATE INDEX IF NOT EXISTS invoices_firm_id_idx ON public.invoices (firm_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_counters FROM anon, authenticated;
GRANT SELECT ON TABLE public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoice_counters TO service_role;

DROP POLICY IF EXISTS "admin can read invoices" ON public.invoices;
CREATE POLICY "admin can read invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Issue a case's invoice, or return the one it already has.
--
-- The per-case lock makes a second caller wait, then find the first one's
-- invoice, so a case never gets two and no number is spent on a duplicate. The
-- counter row's own lock does the same for two cases issuing at once.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_case_id uuid,
  p_firm_id uuid,
  p_issued_at timestamptz,
  p_billed_to_name text,
  p_billed_to_email text,
  p_case_title text,
  p_delivery_mode text,
  p_lines jsonb,
  p_total_cents integer
)
RETURNS public.invoices
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  existing public.invoices;
  issued public.invoices;
  invoice_year integer := extract(year FROM p_issued_at AT TIME ZONE 'America/Chicago')::integer;
  next_number integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('issue_invoice:' || p_case_id::text, 0));

  SELECT * INTO existing FROM public.invoices WHERE case_id = p_case_id;
  IF FOUND THEN
    RETURN existing;
  END IF;

  INSERT INTO public.invoice_counters AS c (year, last_number)
  VALUES (invoice_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO next_number;

  INSERT INTO public.invoices (
    invoice_number, case_id, firm_id, issued_at, billed_to_name, billed_to_email,
    case_title, delivery_mode, lines, total_cents
  )
  VALUES (
    -- 4 digits, more once a year passes 9,999.
    format('INV-%s-%s', invoice_year, lpad(next_number::text, greatest(4, length(next_number::text)), '0')),
    p_case_id, p_firm_id, p_issued_at, p_billed_to_name, p_billed_to_email,
    p_case_title, p_delivery_mode, p_lines, p_total_cents
  )
  RETURNING * INTO issued;

  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid, uuid, timestamptz, text, text, text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, uuid, timestamptz, text, text, text, text, jsonb, integer)
  TO service_role;

COMMIT;

-- What was made: both tables with RLS on, the function, and who may call it.
SELECT c.relname AS name, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('invoices', 'invoice_counters')
UNION ALL
SELECT 'issue_invoice() callable by authenticated: ' || has_function_privilege('authenticated',
         'public.issue_invoice(uuid, uuid, timestamptz, text, text, text, text, jsonb, integer)', 'EXECUTE'),
       NULL, NULL;
