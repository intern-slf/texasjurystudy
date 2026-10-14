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
--     moves or cancels the booking first. Deleting a case deletes its row.
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
-- Needs 20261014_requestee_time_slots.sql first. Run this BEFORE deploying the
-- app change. Safe to re-run. Run in Supabase SQL Editor.
-- =============================================================================

BEGIN;

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

COMMIT;
