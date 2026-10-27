-- =============================================================================
-- PROMO CODES
--
-- A percentage off a case's total (base hours and filters), until the case is
-- marked paid. A firm types a code on the new-case form or its case page; an
-- admin can put a code, or a percentage of their own, on any firm's case.
--
--   * promo_codes: what an admin creates. code is kept in capitals and matched
--     without regard to case ("fall10" finds FALL10). percent_off is a whole
--     number from 1 to 99, so a code never makes a case free. Optional limits:
--     expires_on (the last day it works, in Central Time), max_uses, and
--     firms_only with the firms listed in promo_code_firms. active = false
--     switches a code off. The app never deletes a code.
--   * promo_code_firms: the firms a firms_only code is for. Deleting a firm's
--     login removes its row, and the code stays limited to the rest (firms_only
--     stays true) rather than opening up to everyone.
--   * case_discounts: the discount on a case, one row per case. percent_off is
--     copied from the code when it's applied, so editing or switching off the
--     code later doesn't change a case that already has it. promo_code_id is
--     NULL for an admin's own percentage, typed on the case without a code.
--     applied_by_admin says who put it there. Either side may replace or remove
--     it until the case is paid.
--
-- A use of a code is a case holding it now: removing it from an unpaid case
-- frees the use. A paid case keeps its discount, so that use stays spent.
--
-- Nothing changes once the case's booking is paid (requestee_slot_bookings.
-- paid_at). Every change goes through the functions below. They take a per-case
-- lock and lock the case's booking row, so an admin marking it paid at that
-- moment waits; and apply_promo_code locks the code's row, so two cases can't
-- both take its last use.
--
-- Access: admins read and manage promo_codes and promo_code_firms on their own
-- login, and read case_discounts. Firms never read any of the three: the app's
-- server checks the case is theirs and answers for them. case_discounts is
-- written only by the functions, which only the service role may call.
-- Explicit grants, because Supabase stops granting new public tables
-- automatically on 2026-10-30.
--
-- Needs 20261016_requestee_slot_bookings.sql first, and refuses to run without
-- it. Run this BEFORE deploying the app change. Safe to re-run. Run in Supabase
-- SQL Editor; the query at the end shows the result.
-- =============================================================================

BEGIN;

-- The new foreign keys lock cases and auth.users against writes until COMMIT.
-- It takes moments. If something else holds one of those locks, give up after 5
-- seconds rather than queue every app query behind this one.
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.requestee_slot_bookings') IS NULL THEN
    RAISE EXCEPTION 'Run 20261016_requestee_slot_bookings.sql first; nothing changed';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() is missing; nothing changed';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  percent_off integer NOT NULL,
  -- The last day the code works, in Central Time. NULL: no end date.
  expires_on date,
  -- How many cases may hold it at once. NULL: no limit.
  max_uses integer,
  -- Only the firms in promo_code_firms may use it.
  firms_only boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_key UNIQUE (code),
  -- Capitals, digits, - and _, 3 to 32 of them. The app saves it this way.
  CONSTRAINT promo_codes_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  CONSTRAINT promo_codes_percent_off_range CHECK (percent_off BETWEEN 1 AND 99),
  CONSTRAINT promo_codes_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0)
);

COMMENT ON TABLE public.promo_codes IS
  'Promo codes an admin creates: a whole percentage off a case''s total, with optional end date, use limit and firm list. Switched off, never deleted. Admin-only.';

CREATE INDEX IF NOT EXISTS promo_codes_created_by_idx ON public.promo_codes (created_by);

CREATE TABLE IF NOT EXISTS public.promo_code_firms (
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT promo_code_firms_pkey PRIMARY KEY (promo_code_id, firm_id)
);

COMMENT ON TABLE public.promo_code_firms IS
  'The firms a firms_only promo code is for. Admin-only.';

CREATE INDEX IF NOT EXISTS promo_code_firms_firm_id_idx ON public.promo_code_firms (firm_id);

CREATE TABLE IF NOT EXISTS public.case_discounts (
  case_id uuid NOT NULL,
  -- NULL: an admin's own percentage, typed on the case without a code.
  promo_code_id uuid,
  -- Copied from the code when applied; later changes to the code don't reach it.
  percent_off integer NOT NULL,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by_admin boolean NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_discounts_pkey PRIMARY KEY (case_id),
  CONSTRAINT case_discounts_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE,
  -- A code a case holds can't be deleted, even in the SQL Editor: switch it off.
  CONSTRAINT case_discounts_promo_code_id_fkey
    FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE RESTRICT,
  CONSTRAINT case_discounts_percent_off_range CHECK (percent_off BETWEEN 1 AND 99),
  -- Only an admin puts a percentage on a case without a code.
  CONSTRAINT case_discounts_custom_by_admin CHECK (promo_code_id IS NOT NULL OR applied_by_admin)
);

COMMENT ON TABLE public.case_discounts IS
  'The discount on a case, one row per case. Written only by apply_promo_code(), set_case_discount() and remove_case_discount(), and never once the case is paid. Admins read; the app''s server writes.';

CREATE INDEX IF NOT EXISTS case_discounts_promo_code_id_idx ON public.case_discounts (promo_code_id);
CREATE INDEX IF NOT EXISTS case_discounts_applied_by_idx ON public.case_discounts (applied_by);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_discounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.promo_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.promo_code_firms FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_discounts FROM anon, authenticated;
-- No DELETE on promo_codes: a code is switched off, so the cases that held it
-- still say which code it was.
GRANT SELECT, INSERT, UPDATE ON TABLE public.promo_codes TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.promo_code_firms TO authenticated;
GRANT SELECT ON TABLE public.case_discounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_code_firms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_discounts TO service_role;

DROP POLICY IF EXISTS "admin can manage promo_codes" ON public.promo_codes;
CREATE POLICY "admin can manage promo_codes"
  ON public.promo_codes
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admin can manage promo_code_firms" ON public.promo_code_firms;
CREATE POLICY "admin can manage promo_code_firms"
  ON public.promo_code_firms
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "admin can read case_discounts" ON public.case_discounts;
CREATE POLICY "admin can read case_discounts"
  ON public.case_discounts
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Whether a code may go on a case of this firm now, and for how much.
--
-- outcome: ok | not_found | inactive | not_for_firm | expired | used_up.
-- not_for_firm comes before expired and used_up, so a firm learns nothing
-- about another firm's code. p_case_id's own use isn't counted, so applying a
-- code to a case that already holds it still works. Used on its own by the
-- new-case form, before the case exists.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_promo_code(p_code text, p_firm_id uuid, p_case_id uuid DEFAULT NULL)
RETURNS TABLE (outcome text, promo_code_id uuid, percent_off integer)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  c public.promo_codes;
  held integer;
BEGIN
  SELECT p.* INTO c FROM public.promo_codes p WHERE p.code = upper(btrim(coalesce(p_code, '')));
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF NOT c.active THEN
    RETURN QUERY SELECT 'inactive'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF c.firms_only AND NOT EXISTS (
    SELECT 1 FROM public.promo_code_firms f WHERE f.promo_code_id = c.id AND f.firm_id = p_firm_id
  ) THEN
    RETURN QUERY SELECT 'not_for_firm'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF c.expires_on IS NOT NULL AND c.expires_on < (now() AT TIME ZONE 'America/Chicago')::date THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF c.max_uses IS NOT NULL THEN
    SELECT count(*) INTO held
      FROM public.case_discounts d
     WHERE d.promo_code_id = c.id AND d.case_id IS DISTINCT FROM p_case_id;
    IF held >= c.max_uses THEN
      RETURN QUERY SELECT 'used_up'::text, NULL::uuid, NULL::integer;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT 'ok'::text, c.id, c.percent_off;
END;
$$;

-- -----------------------------------------------------------------------------
-- Takes the case's discount lock and locks its booking row, so the booking
-- can't be marked paid until the caller's transaction ends. True when it is
-- already paid, and the caller then changes nothing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_case_discount(p_case_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  paid timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('case_discount:' || p_case_id::text, 0));
  SELECT b.paid_at INTO paid FROM public.requestee_slot_bookings b WHERE b.case_id = p_case_id FOR SHARE;
  RETURN paid IS NOT NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- Puts a code on a case, replacing whatever discount it had.
--
-- outcome: applied, paid, or one of check_promo_code's. p_firm_id is the
-- case's firm (requestee_id, else its creator), whoever is applying it: an
-- admin applying a code is held to the same limits.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_promo_code(
  p_case_id uuid,
  p_code text,
  p_firm_id uuid,
  p_applied_by uuid,
  p_by_admin boolean
)
RETURNS TABLE (outcome text, percent_off integer)
LANGUAGE plpgsql
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  checked record;
BEGIN
  IF public.lock_case_discount(p_case_id) THEN
    RETURN QUERY SELECT 'paid'::text, NULL::integer;
    RETURN;
  END IF;

  -- The code's row: a second case taking it waits here, then counts this use.
  PERFORM 1 FROM public.promo_codes p WHERE p.code = upper(btrim(coalesce(p_code, ''))) FOR UPDATE;

  SELECT * INTO checked FROM public.check_promo_code(p_code, p_firm_id, p_case_id);
  IF checked.outcome <> 'ok' THEN
    RETURN QUERY SELECT checked.outcome, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.case_discounts AS d (case_id, promo_code_id, percent_off, applied_by, applied_by_admin, applied_at)
  VALUES (p_case_id, checked.promo_code_id, checked.percent_off, p_applied_by, p_by_admin, now())
  ON CONFLICT (case_id) DO UPDATE
    SET promo_code_id = EXCLUDED.promo_code_id,
        percent_off = EXCLUDED.percent_off,
        applied_by = EXCLUDED.applied_by,
        applied_by_admin = EXCLUDED.applied_by_admin,
        applied_at = EXCLUDED.applied_at;

  RETURN QUERY SELECT 'applied'::text, checked.percent_off;
END;
$$;

-- -----------------------------------------------------------------------------
-- An admin's own percentage on a case, without a code, replacing whatever
-- discount it had. Returns applied, paid or bad_percent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_case_discount(p_case_id uuid, p_percent_off integer, p_applied_by uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_percent_off IS NULL OR p_percent_off NOT BETWEEN 1 AND 99 THEN
    RETURN 'bad_percent';
  END IF;
  IF public.lock_case_discount(p_case_id) THEN
    RETURN 'paid';
  END IF;

  INSERT INTO public.case_discounts AS d (case_id, promo_code_id, percent_off, applied_by, applied_by_admin, applied_at)
  VALUES (p_case_id, NULL, p_percent_off, p_applied_by, true, now())
  ON CONFLICT (case_id) DO UPDATE
    SET promo_code_id = NULL,
        percent_off = EXCLUDED.percent_off,
        applied_by = EXCLUDED.applied_by,
        applied_by_admin = true,
        applied_at = EXCLUDED.applied_at;

  RETURN 'applied';
END;
$$;

-- -----------------------------------------------------------------------------
-- Takes the discount off a case, freeing its code's use. Returns removed, none
-- (there wasn't one) or paid.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_case_discount(p_case_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.lock_case_discount(p_case_id) THEN
    RETURN 'paid';
  END IF;
  DELETE FROM public.case_discounts d WHERE d.case_id = p_case_id;
  RETURN CASE WHEN FOUND THEN 'removed' ELSE 'none' END;
END;
$$;

REVOKE ALL ON FUNCTION public.check_promo_code(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_case_discount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_promo_code(uuid, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_case_discount(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_case_discount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_promo_code(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_case_discount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_promo_code(uuid, text, uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_case_discount(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_case_discount(uuid) TO service_role;

-- Self-check, on two real cases with no discount and no payment (and a paid
-- one, where there is one): a code with one use goes on the first, is refused
-- on the second, and moves to it once the first lets go; switched off, limited
-- to other firms, or past its last day, it's refused; nothing changes on a paid
-- case. Everything it does is undone by raising self_check_undo (SQLSTATE
-- TJS01) inside its own block. Rolls everything back if any check fails.
DO $$
DECLARE
  case_a uuid;
  firm_a uuid;
  case_b uuid;
  firm_b uuid;
  paid_case uuid;
  paid_firm uuid;
  test_code text := 'SELFCHECK-' || upper(substr(md5(random()::text), 1, 8));
  test_id uuid;
  got text;
BEGIN
  SELECT c.id, coalesce(c.requestee_id, c.user_id) INTO case_a, firm_a
    FROM public.cases c
   WHERE NOT EXISTS (SELECT 1 FROM public.case_discounts d WHERE d.case_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.requestee_slot_bookings b WHERE b.case_id = c.id AND b.paid_at IS NOT NULL)
   ORDER BY c.created_at DESC
   LIMIT 1;
  SELECT c.id, coalesce(c.requestee_id, c.user_id) INTO case_b, firm_b
    FROM public.cases c
   WHERE c.id IS DISTINCT FROM case_a
     AND NOT EXISTS (SELECT 1 FROM public.case_discounts d WHERE d.case_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM public.requestee_slot_bookings b WHERE b.case_id = c.id AND b.paid_at IS NOT NULL)
   ORDER BY c.created_at DESC
   LIMIT 1;
  SELECT c.id, coalesce(c.requestee_id, c.user_id) INTO paid_case, paid_firm
    FROM public.cases c
    JOIN public.requestee_slot_bookings b ON b.case_id = c.id AND b.paid_at IS NOT NULL
   LIMIT 1;

  IF case_a IS NULL OR case_b IS NULL THEN
    RAISE NOTICE 'Self-check skipped: fewer than two cases without a discount or payment';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.promo_codes (code, percent_off, max_uses)
    VALUES (test_code, 10, 1)
    RETURNING id INTO test_id;

    -- 1. One use: the first case takes it, the second is refused.
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, lower(test_code), firm_a, NULL, false);
    IF got <> 'applied' THEN
      RAISE EXCEPTION 'Self-check: a code with a use left was refused (%); nothing changed', got;
    END IF;
    IF (SELECT d.percent_off FROM public.case_discounts d WHERE d.case_id = case_a) IS DISTINCT FROM 10 THEN
      RAISE EXCEPTION 'Self-check: the case did not get the code''s percentage; nothing changed';
    END IF;
    SELECT outcome INTO got FROM public.apply_promo_code(case_b, test_code, firm_b, NULL, false);
    IF got <> 'used_up' THEN
      RAISE EXCEPTION 'Self-check: a code with no uses left went on another case (%); nothing changed', got;
    END IF;

    -- 2. The case holding it can apply it again; its own use isn't counted.
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, test_code, firm_a, NULL, false);
    IF got <> 'applied' THEN
      RAISE EXCEPTION 'Self-check: a case could not re-apply the code it holds (%); nothing changed', got;
    END IF;

    -- 3. Editing the code doesn't reach a case that has it.
    UPDATE public.promo_codes SET percent_off = 50 WHERE id = test_id;
    IF (SELECT d.percent_off FROM public.case_discounts d WHERE d.case_id = case_a) IS DISTINCT FROM 10 THEN
      RAISE EXCEPTION 'Self-check: editing a code changed a case that already had it; nothing changed';
    END IF;

    -- 4. Removing it frees the use.
    IF public.remove_case_discount(case_a) <> 'removed' THEN
      RAISE EXCEPTION 'Self-check: a discount could not be removed; nothing changed';
    END IF;
    SELECT outcome INTO got FROM public.apply_promo_code(case_b, test_code, firm_b, NULL, false);
    IF got <> 'applied' THEN
      RAISE EXCEPTION 'Self-check: removing a code did not free its use (%); nothing changed', got;
    END IF;

    -- 5. Switched off, for other firms only, or past its last day: refused.
    UPDATE public.promo_codes SET max_uses = NULL, active = false WHERE id = test_id;
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, test_code, firm_a, NULL, false);
    IF got <> 'inactive' THEN
      RAISE EXCEPTION 'Self-check: a switched-off code was not refused (%); nothing changed', got;
    END IF;
    UPDATE public.promo_codes SET active = true, firms_only = true WHERE id = test_id;
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, test_code, firm_a, NULL, false);
    IF got <> 'not_for_firm' THEN
      RAISE EXCEPTION 'Self-check: a code for other firms was not refused (%); nothing changed', got;
    END IF;
    INSERT INTO public.promo_code_firms (promo_code_id, firm_id) VALUES (test_id, firm_a);
    UPDATE public.promo_codes
       SET expires_on = (now() AT TIME ZONE 'America/Chicago')::date - 1
     WHERE id = test_id;
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, test_code, firm_a, NULL, false);
    IF got <> 'expired' THEN
      RAISE EXCEPTION 'Self-check: a code past its last day was not refused (%); nothing changed', got;
    END IF;
    UPDATE public.promo_codes
       SET expires_on = (now() AT TIME ZONE 'America/Chicago')::date
     WHERE id = test_id;
    SELECT outcome INTO got FROM public.apply_promo_code(case_a, test_code, firm_a, NULL, false);
    IF got <> 'applied' THEN
      RAISE EXCEPTION 'Self-check: a code was refused on its last day, by a firm it is for (%); nothing changed', got;
    END IF;

    -- 6. An admin's own percentage replaces the code; out of range is refused.
    --    Each call is a statement of its own: a read in the same statement as
    --    the write would see the table as it was before it.
    got := public.set_case_discount(case_a, 25, NULL);
    IF got <> 'applied' THEN
      RAISE EXCEPTION 'Self-check: an admin''s percentage was refused (%); nothing changed', got;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.case_discounts d
       WHERE d.case_id = case_a AND d.promo_code_id IS NULL AND d.percent_off = 25 AND d.applied_by_admin
    ) THEN
      RAISE EXCEPTION 'Self-check: an admin''s percentage did not replace the code; nothing changed';
    END IF;
    got := public.set_case_discount(case_a, 100, NULL);
    IF got <> 'bad_percent' THEN
      RAISE EXCEPTION 'Self-check: a 100%% discount was allowed (%); nothing changed', got;
    END IF;

    -- 7. A paid case: nothing changes.
    IF paid_case IS NOT NULL THEN
      SELECT outcome INTO got FROM public.apply_promo_code(paid_case, test_code, paid_firm, NULL, true);
      IF got <> 'paid' THEN
        RAISE EXCEPTION 'Self-check: a code went on a paid case (%); nothing changed', got;
      END IF;
      got := public.set_case_discount(paid_case, 10, NULL);
      IF got <> 'paid' THEN
        RAISE EXCEPTION 'Self-check: an admin''s percentage went on a paid case (%); nothing changed', got;
      END IF;
      got := public.remove_case_discount(paid_case);
      IF got <> 'paid' THEN
        RAISE EXCEPTION 'Self-check: a paid case''s discount could be removed (%); nothing changed', got;
      END IF;
    END IF;

    RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
  EXCEPTION WHEN SQLSTATE 'TJS01' THEN
    NULL;
  END;
END $$;

COMMIT;

-- What was made: the three tables with RLS on and their policies, and whether a
-- signed-in user can call the functions (all four should read false). Every
-- query ends in LIMIT because the SQL Editor adds "limit 100" to one without.
SELECT c.relname AS name, c.relrowsecurity::text AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::text AS policies
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('promo_codes', 'promo_code_firms', 'case_discounts')
UNION ALL
SELECT f.name || '() callable by authenticated', has_function_privilege('authenticated', f.sig, 'EXECUTE')::text, NULL
  FROM (VALUES
    ('check_promo_code', 'public.check_promo_code(text, uuid, uuid)'),
    ('apply_promo_code', 'public.apply_promo_code(uuid, text, uuid, uuid, boolean)'),
    ('set_case_discount', 'public.set_case_discount(uuid, integer, uuid)'),
    ('remove_case_discount', 'public.remove_case_discount(uuid)')
  ) AS f(name, sig)
LIMIT 10;
