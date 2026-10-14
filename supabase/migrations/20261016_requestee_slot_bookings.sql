-- =============================================================================
-- REQUESTEE SLOT BOOKINGS
--
-- A law firm books one of the admin's open time slots for an online focus group
-- (requestee_time_slots, 20261014_requestee_time_slots.sql). This table records
-- which case holds which slot, and whether the firm has paid.
--
-- One row per case, and the row stays when the case gives its slot up
-- (slot_id goes back to NULL). Two things depend on that:
--   * held_since, the start of the payment clock. Payment is due one working
--     day after it, and an admin may release an unpaid hold after that. A firm
--     that switches slots, or cancels and books again, keeps its clock; only an
--     admin's release for non-payment, or a rejection, starts a new one.
--   * paid_at belongs to the case, not the slot, so it survives an admin moving
--     the booking to another time.
--
-- The constraints do the booking rules' hard part:
--   * case_id is the key: a case holds at most one slot.
--   * slot_id is UNIQUE: a slot is held by at most one case, so two firms
--     racing for the same slot can't both get it (the second gets 23505).
--   * Deleting a booked slot is refused (ON DELETE RESTRICT, 23503); the admin
--     moves or cancels the booking first. Deleting a case deletes its row,
--     except that a firm can't delete a case whose booking is paid, not even by
--     deleting its parent case (the second trigger at the end): paid_at is the
--     only record of the payment.
--
-- Released automatically, by the trigger at the end: an unpaid hold on a slot
-- that hasn't started, when its case is rejected, archived while still under
-- review, or switched to in person (slots are for online focus groups). A paid
-- hold is never released automatically: money has changed hands, so an admin
-- decides, and the case page warns them.
--
-- Admin-only, like requestee_time_slots: firms read and write bookings through
-- the app's server, which checks the case is theirs and never shows them
-- another firm's booking. Explicit grants, because Supabase stops granting new
-- public tables automatically on 2026-10-30.
--
-- Needs 20261014_requestee_time_slots.sql and 20261005_protect_case_admin_fields.sql
-- (F28, for public.caller_is_admin()) first, and refuses to run without them.
-- Run this BEFORE deploying the app change. Safe to re-run. Run in Supabase SQL
-- Editor; the query at the end shows the result.
-- =============================================================================

BEGIN;

-- Until COMMIT, the triggers below lock cases against writes (and, when this is
-- re-run, against reads too), and the new foreign keys lock auth.users and
-- requestee_time_slots the same way. It takes moments. If something else holds
-- one of those locks, give up after 5 seconds rather than queue every app query
-- behind this one.
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.requestee_time_slots') IS NULL THEN
    RAISE EXCEPTION 'Run 20261014_requestee_time_slots.sql first; nothing changed';
  END IF;
  IF to_regprocedure('public.caller_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Run 20261005_protect_case_admin_fields.sql first; nothing changed';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.requestee_slot_bookings (
  case_id uuid NOT NULL,
  slot_id uuid,
  -- The firm login that booked (or the admin who booked for them).
  booked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Start of the payment clock. NULL when no clock is running.
  held_since timestamptz,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Named so the app can tell "slot taken" from "case already has a slot".
  CONSTRAINT requestee_slot_bookings_pkey PRIMARY KEY (case_id),
  CONSTRAINT requestee_slot_bookings_slot_key UNIQUE (slot_id),
  CONSTRAINT requestee_slot_bookings_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE,
  CONSTRAINT requestee_slot_bookings_slot_id_fkey
    FOREIGN KEY (slot_id) REFERENCES public.requestee_time_slots(id) ON DELETE RESTRICT,
  -- One way only: paid_by goes NULL if that admin's login is deleted.
  CONSTRAINT requestee_slot_bookings_paid_by_needs_paid_at CHECK (paid_by IS NULL OR paid_at IS NOT NULL),
  -- A slot held means a clock is running.
  CONSTRAINT requestee_slot_bookings_slot_needs_clock CHECK (slot_id IS NULL OR held_since IS NOT NULL)
);

COMMENT ON TABLE public.requestee_slot_bookings IS
  'Which case holds which requestee time slot, and whether the firm has paid. One row per case; slot_id is NULL when the case holds no slot. Admin-only.';
COMMENT ON COLUMN public.requestee_slot_bookings.held_since IS
  'Start of the payment clock (due one working day later). Kept when the firm switches or cancels; cleared when an admin releases the hold for non-payment or the case is rejected.';

CREATE INDEX IF NOT EXISTS requestee_slot_bookings_booked_by_idx
  ON public.requestee_slot_bookings (booked_by);
CREATE INDEX IF NOT EXISTS requestee_slot_bookings_paid_by_idx
  ON public.requestee_slot_bookings (paid_by);

ALTER TABLE public.requestee_slot_bookings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.requestee_slot_bookings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.requestee_slot_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.requestee_slot_bookings TO service_role;

DROP POLICY IF EXISTS "admin can manage requestee_slot_bookings" ON public.requestee_slot_bookings;
CREATE POLICY "admin can manage requestee_slot_bookings"
  ON public.requestee_slot_bookings
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Free an unpaid hold when its case can no longer use it.
--
-- SECURITY DEFINER because the firm archiving its own case, or switching it to
-- in person, can't touch this table itself. It only ever clears slot_id on the
-- row of the case being updated, so it grants nothing else.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_slot_booking_on_case_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rejected boolean := NEW.admin_status = 'rejected' AND OLD.admin_status IS DISTINCT FROM 'rejected';
  archived boolean := NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
                      AND NEW.admin_status IN ('all', 'rejected');
  went_offline boolean := NEW.delivery_mode = 'offline' AND OLD.delivery_mode IS DISTINCT FROM 'offline';
BEGIN
  IF NOT (rejected OR archived OR went_offline) THEN
    RETURN NEW;
  END IF;

  UPDATE public.requestee_slot_bookings b
     SET slot_id = NULL,
         -- A rejected case that comes back starts a new clock; a firm's own
         -- archive or format change doesn't.
         held_since = CASE WHEN rejected THEN NULL ELSE b.held_since END,
         updated_at = now()
   WHERE b.case_id = NEW.id
     AND b.slot_id IS NOT NULL
     AND b.paid_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.requestee_time_slots s
        WHERE s.id = b.slot_id AND s.starts_at > now()
     );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_slot_booking_on_case_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cases_release_slot_booking ON public.cases;
CREATE TRIGGER cases_release_slot_booking
  AFTER UPDATE OF admin_status, deleted_at, delivery_mode ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.release_slot_booking_on_case_change();

-- -----------------------------------------------------------------------------
-- Keep a paid booking when a firm deletes its case.
--
-- A case's booking row goes with the case (the foreign key cascades), and
-- paid_at is the only record that the firm paid. A firm can delete its own case
-- (the cases DELETE policies, and the dashboard's Permanently Delete on archived
-- and past cases), so no delete a firm makes may take a case whose booking is
-- paid: it asks us. That includes a case deleted along with another one, such as
-- a follow-up whose parent the firm deletes, should that foreign key cascade.
--
-- Who is deleting is the request's role (the "role" setting PostgREST makes for
-- each request), not current_user. Inside this SECURITY DEFINER function
-- current_user is the owner, and in a cascaded delete it is the table's owner even
-- when a firm started it; the role setting stays 'authenticated' through both.
-- Server code (service_role), the SQL Editor and the auth server (no role set,
-- 'none') aren't limited, and nor is an admin on their own login. No DELETE
-- policy lets an admin's login delete a firm's case, though, so staff remove a
-- paid case in the SQL Editor or through server code.
--
-- SECURITY DEFINER so it can read this admin-only table. A trigger function can't
-- be called on its own, and EXECUTE is revoked anyway.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.keep_paid_slot_booking_on_case_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller text := current_setting('role');
  paid timestamptz;
BEGIN
  IF caller NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;
  IF caller = 'authenticated' THEN
    IF public.caller_is_admin() THEN
      RETURN OLD;
    END IF;
  END IF;
  -- Locked, so an admin marking it paid can't slip in between this check and
  -- the cascade that deletes it: their update waits, then finds it gone.
  SELECT b.paid_at INTO paid
    FROM public.requestee_slot_bookings b
   WHERE b.case_id = OLD.id
     FOR SHARE;
  IF paid IS NOT NULL THEN
    RAISE EXCEPTION 'This case has a paid focus group booking, so only staff can delete it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_paid_slot_booking_on_case_delete() FROM PUBLIC, anon, authenticated;

-- An earlier draft of this file gave the guard a helper the browser could call.
-- It was never run in production; drop it wherever it was.
DROP FUNCTION IF EXISTS public.own_case_slot_booking_is_paid(uuid);

DROP TRIGGER IF EXISTS cases_keep_paid_slot_booking ON public.cases;
CREATE TRIGGER cases_keep_paid_slot_booking
  BEFORE DELETE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_paid_slot_booking_on_case_delete();

-- Self-check: with an unpaid hold on a future slot, rejecting the case frees
-- the slot and stops the clock; with a paid hold, it doesn't. Uses a slot and a
-- case that already exist, and undoes everything (the 'self-check: undo'
-- exception rolls back to the start of each block). Skipped when there is no
-- future slot or no case to try it on.
DO $$
DECLARE
  some_slot uuid;
  some_case uuid;
  some_status text;
  row_after public.requestee_slot_bookings%ROWTYPE;
BEGIN
  SELECT s.id INTO some_slot
  FROM public.requestee_time_slots s
  WHERE s.starts_at > now() + interval '1 hour'
    AND NOT EXISTS (SELECT 1 FROM public.requestee_slot_bookings b WHERE b.slot_id = s.id)
  LIMIT 1;

  SELECT c.id, c.admin_status INTO some_case, some_status
  FROM public.cases c
  WHERE c.admin_status IN ('all', 'approved', 'submitted')
    AND NOT EXISTS (SELECT 1 FROM public.requestee_slot_bookings b WHERE b.case_id = c.id)
  LIMIT 1;

  IF some_slot IS NULL OR some_case IS NULL THEN
    RETURN;
  END IF;

  -- 1. Unpaid: released, clock stopped.
  BEGIN
    INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since)
    VALUES (some_case, some_slot, now());
    UPDATE public.cases SET admin_status = 'rejected' WHERE id = some_case;
    SELECT * INTO row_after FROM public.requestee_slot_bookings WHERE case_id = some_case;
    IF row_after.slot_id IS NOT NULL OR row_after.held_since IS NOT NULL THEN
      RAISE EXCEPTION 'Self-check: rejecting a case did not free its unpaid hold; nothing changed';
    END IF;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;

  -- 2. Paid: kept.
  BEGIN
    INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since, paid_at)
    VALUES (some_case, some_slot, now(), now());
    UPDATE public.cases SET admin_status = 'rejected' WHERE id = some_case;
    SELECT * INTO row_after FROM public.requestee_slot_bookings WHERE case_id = some_case;
    IF row_after.slot_id IS DISTINCT FROM some_slot THEN
      RAISE EXCEPTION 'Self-check: rejecting a case freed a paid hold; nothing changed';
    END IF;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;
END $$;

-- Self-check for the delete guard. It works on fresh copies of a firm's case
-- (made as postgres, then undone with everything else), so nothing else points
-- at them, and acts as that firm: once acting as a user, RLS hides other rows.
-- With a paid booking the delete is refused; with an unpaid one, or none, the
-- guard lets it through; and deleting a paid case's parent doesn't take it
-- along, whatever the parent foreign key does. Skipped when no firm has a case
-- to copy.
DO $$
DECLARE
  firm uuid;
  template_case uuid;
  test_case uuid;
  parent_case uuid;
  parent_key text;
  parent_rule "char";
  refusing_key text;
  changed integer;
BEGIN
  SELECT c.id, c.user_id INTO template_case, firm
  FROM public.cases c
  WHERE c.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = c.user_id AND r.role = 'admin')
  LIMIT 1;

  IF template_case IS NULL THEN
    RETURN;
  END IF;

  -- The key that ties a follow-up to its parent case (parent_case_id), whatever
  -- it is named, and what it does when the parent is deleted.
  SELECT k.conname, k.confdeltype INTO parent_key, parent_rule
  FROM pg_constraint k
  WHERE k.conrelid = 'public.cases'::regclass
    AND k.confrelid = 'public.cases'::regclass
    AND k.contype = 'f'
    AND k.conkey = ARRAY[(
      SELECT a.attnum FROM pg_attribute a
       WHERE a.attrelid = 'public.cases'::regclass AND a.attname = 'parent_case_id'
    )]
  LIMIT 1;

  -- 3. Paid: the firm can't delete the case.
  BEGIN
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status)
    SELECT user_id, title, description, documentation_type, filters, 'previous'
      FROM public.cases WHERE id = template_case
    RETURNING id INTO test_case;
    INSERT INTO public.requestee_slot_bookings (case_id, held_since, paid_at)
    VALUES (test_case, now(), now());
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', firm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', firm::text, true);
    BEGIN
      DELETE FROM public.cases WHERE id = test_case;
      -- No row means the firm can't delete its case at all, which is fine too.
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed > 0 THEN
        RAISE EXCEPTION 'Self-check: a firm could delete its case and the paid booking with it; nothing changed';
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'This case has a paid focus group booking%' THEN
        RAISE;
      END IF;
    END;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;

  -- 4. Unpaid: the guard lets the delete through. The firm may delete its own
  --    case ("user can delete own cases"), so the row goes. (A foreign key
  --    refusing it is checked after this BEFORE trigger, so it would mean the
  --    guard had let it through.)
  BEGIN
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status)
    SELECT user_id, title, description, documentation_type, filters, 'previous'
      FROM public.cases WHERE id = template_case
    RETURNING id INTO test_case;
    INSERT INTO public.requestee_slot_bookings (case_id, held_since)
    VALUES (test_case, now());
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', firm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', firm::text, true);
    BEGIN
      DELETE FROM public.cases WHERE id = test_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not delete its own case with an unpaid booking (% rows); nothing changed', changed;
      END IF;
    EXCEPTION
      WHEN foreign_key_violation THEN
        NULL;
      WHEN insufficient_privilege THEN
        IF SQLERRM LIKE 'This case has a paid focus group booking%' THEN
          RAISE EXCEPTION 'Self-check: a firm could not delete its own case with an unpaid booking; nothing changed';
        END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;

  -- 5. Paid, and its parent deleted by the firm: still kept. A fresh paid copy
  --    is made the follow-up of another fresh copy. The parent key may refuse
  --    the delete, take the follow-up along (then the guard must refuse), or
  --    unlink it; the paid booking has to survive each. Only that key may refuse
  --    (another one refusing wouldn't show what the guard did), and the guard
  --    only when the key takes the follow-up along: the parent itself is unpaid.
  BEGIN
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status)
    SELECT user_id, title, description, documentation_type, filters, 'previous'
      FROM public.cases WHERE id = template_case
    RETURNING id INTO parent_case;
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status, parent_case_id)
    SELECT user_id, title, description, documentation_type, filters, 'previous', parent_case
      FROM public.cases WHERE id = template_case
    RETURNING id INTO test_case;
    INSERT INTO public.requestee_slot_bookings (case_id, held_since, paid_at)
    VALUES (test_case, now(), now());
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', firm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', firm::text, true);
    BEGIN
      DELETE FROM public.cases WHERE id = parent_case;
    EXCEPTION
      WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS refusing_key = CONSTRAINT_NAME;
        IF refusing_key IS DISTINCT FROM parent_key THEN
          RAISE;
        END IF;
      WHEN insufficient_privilege THEN
        IF SQLERRM NOT LIKE 'This case has a paid focus group booking%' THEN
          RAISE;
        END IF;
        IF parent_rule IS DISTINCT FROM 'c' THEN
          RAISE EXCEPTION 'Self-check: the guard refused a firm deleting a case with no booking; nothing changed';
        END IF;
    END;
    RESET ROLE;
    IF NOT EXISTS (
      SELECT 1 FROM public.requestee_slot_bookings b
       WHERE b.case_id = test_case AND b.paid_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Self-check: a firm could delete a paid case by deleting its parent; nothing changed';
    END IF;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;

  -- 6. No booking at all, the commonest delete: the guard lets it through, and
  --    the row goes (a foreign key refusing it would come after the guard).
  BEGIN
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status)
    SELECT user_id, title, description, documentation_type, filters, 'previous'
      FROM public.cases WHERE id = template_case
    RETURNING id INTO test_case;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', firm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', firm::text, true);
    BEGIN
      DELETE FROM public.cases WHERE id = test_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not delete its own case with no booking (% rows); nothing changed', changed;
      END IF;
    EXCEPTION
      WHEN foreign_key_violation THEN
        NULL;
      WHEN insufficient_privilege THEN
        IF SQLERRM LIKE 'This case has a paid focus group booking%' THEN
          RAISE EXCEPTION 'Self-check: the guard refused a firm deleting a case with no booking; nothing changed';
        END IF;
        RAISE;
    END;
    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;
END $$;

COMMIT;

-- Verify: one row, reading true, true, true, false, and then what deleting a
-- parent case does to its follow-ups in this database, which the schema export
-- doesn't show: a (no action) or r (restrict) refuses while it has any, c
-- deletes them too, n or d unlinks them (parent_case_id has no default), and
-- empty means there is no such key, so they keep a parent id that no longer
-- exists. The guard covers each. Ends in LIMIT because the SQL Editor adds
-- "limit 100" to a SELECT that has none.
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.cases'::regclass
      AND t.tgname = 'cases_release_slot_booking'
      AND t.tgenabled = 'O'
  ) AS release_trigger_enabled,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.cases'::regclass
      AND t.tgname = 'cases_keep_paid_slot_booking'
      AND t.tgenabled = 'O'
  ) AS delete_guard_enabled,
  (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = 'public.keep_paid_slot_booking_on_case_delete()'::regprocedure) AS guard_reads_bookings_as_owner,
  has_function_privilege('authenticated', 'public.keep_paid_slot_booking_on_case_delete()', 'EXECUTE') AS signed_in_can_call_guard,
  (SELECT k.confdeltype::text FROM pg_constraint k
    WHERE k.conrelid = 'public.cases'::regclass
      AND k.confrelid = 'public.cases'::regclass
      AND k.contype = 'f'
      AND k.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
         WHERE a.attrelid = 'public.cases'::regclass AND a.attname = 'parent_case_id'
      )]
    LIMIT 1) AS deleting_a_parent_case
LIMIT 1;
