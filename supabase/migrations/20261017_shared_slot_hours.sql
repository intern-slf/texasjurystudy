-- =============================================================================
-- SHARED SLOT HOURS
--
-- A time slot (requestee_time_slots) is now a session window with hours to sell.
-- Several firms' cases can book the same slot, each taking the hours its firm
-- pays for: hours_requested, or 1 hour when that is empty or 0 (billableHours in
-- client/lib/receipt-pricing.ts). The slot is full once its hours are used up.
-- Before this, one case held a whole slot, so a 1-hour case on a 9-12 slot
-- blocked all three hours. Firms claim hours, not a time inside the slot; the
-- admin lays the cases out when building the slot's session.
--
-- 1. requestee_slot_bookings_slot_key (UNIQUE slot_id) goes, so a slot can have
--    several bookings. slot_id gets a plain index instead, for its foreign key
--    and the per-slot sums.
-- 2. Trigger slot_bookings_keep_within_hours (BEFORE INSERT OR UPDATE OF
--    slot_id, case_id): refuses a booking that would take its slot past its
--    hours.
-- 3. Trigger cases_keep_booked_hours_within_slot (BEFORE UPDATE OF
--    hours_requested): refuses raising a booked case's hours past what its slot
--    has left. (A firm can change its hours while its case is under review.)
--    Not when the same edit takes the case out of its slot (rejected, archived
--    under review, or switched to in person, with an unpaid hold on a slot that
--    hasn't started), which cases_release_slot_booking then frees.
--
-- Both lock the slot's row before counting, so two bookings made at the same
-- moment are counted one after the other: the second waits, then sees the
-- first. Both refuse with SQLSTATE 23514 (check_violation) and a message
-- starting "requestee_slot_full", which the app turns into "only N hours left".
-- They apply to everyone, admins included: the hours are what is being sold.
-- Bookings already over their slot's hours (an admin could book a long case into
-- a short slot before this) stay as they are; only a new booking, a move, or a
-- rise in hours is checked.
--
-- Needs 20261016_requestee_slot_bookings.sql first and refuses to run without
-- it. Run this BEFORE deploying the app change: the app counts hours per slot
-- and expects the database to refuse an over-full slot. Safe to re-run. Run in
-- the Supabase SQL Editor; the query at the end shows the result.
-- =============================================================================

BEGIN;

-- Until COMMIT the new triggers lock cases and requestee_slot_bookings against
-- writes. It takes moments; give up after 5 seconds rather than queue every
-- app query behind this one.
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.requestee_slot_bookings') IS NULL THEN
    RAISE EXCEPTION 'Run 20261016_requestee_slot_bookings.sql first; nothing changed';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Several bookings per slot.
-- -----------------------------------------------------------------------------
ALTER TABLE public.requestee_slot_bookings
  DROP CONSTRAINT IF EXISTS requestee_slot_bookings_slot_key;

CREATE INDEX IF NOT EXISTS requestee_slot_bookings_slot_id_idx
  ON public.requestee_slot_bookings (slot_id);

COMMENT ON COLUMN public.requestee_slot_bookings.slot_id IS
  'The time slot this case holds hours in, or NULL. A slot can hold several cases while their hours fit in it (trigger slot_bookings_keep_within_hours).';

-- -----------------------------------------------------------------------------
-- 2 and 3. Keep each slot within its hours.
--
-- SECURITY DEFINER because the counting reads every firm's bookings and cases,
-- which a firm's login can't, when the firm changes its own hours. Neither
-- function writes anything; each only refuses.
-- -----------------------------------------------------------------------------

-- Minutes a slot has left for one more case: its length less the hours every
-- other case booked in it pays for. Locks the slot's row first. Null when the
-- slot doesn't exist (the foreign key reports that).
CREATE OR REPLACE FUNCTION public.slot_minutes_left_for(slot uuid, other_than uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  slot_minutes numeric;
  taken numeric;
BEGIN
  SELECT extract(epoch FROM s.ends_at - s.starts_at) / 60
    INTO slot_minutes
    FROM public.requestee_time_slots s
   WHERE s.id = slot
     FOR UPDATE;
  IF slot_minutes IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(CASE WHEN c.hours_requested > 0 THEN c.hours_requested * 60 ELSE 60 END), 0)
    INTO taken
    FROM public.requestee_slot_bookings b
    JOIN public.cases c ON c.id = b.case_id
   WHERE b.slot_id = slot
     AND b.case_id <> other_than;

  RETURN slot_minutes - taken;
END;
$$;

REVOKE ALL ON FUNCTION public.slot_minutes_left_for(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.keep_slot_booking_within_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  needed numeric;
  minutes_left numeric;
BEGIN
  IF NEW.slot_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.slot_id IS NOT DISTINCT FROM OLD.slot_id AND NEW.case_id = OLD.case_id) THEN
    RETURN NEW;
  END IF;

  -- Locks the case row first, as an UPDATE of its hours does before its own
  -- trigger runs: a rise in the case's hours and this booking then wait for
  -- each other instead of each counting without the other. Both take the case,
  -- then the slot, so they can't deadlock.
  SELECT CASE WHEN c.hours_requested > 0 THEN c.hours_requested * 60 ELSE 60 END
    INTO needed
    FROM public.cases c
   WHERE c.id = NEW.case_id
     FOR SHARE;

  minutes_left := public.slot_minutes_left_for(NEW.slot_id, NEW.case_id);
  IF minutes_left IS NOT NULL AND coalesce(needed, 60) > minutes_left THEN
    RAISE EXCEPTION 'requestee_slot_full: % minutes left in this slot, % needed', round(greatest(minutes_left, 0)), round(coalesce(needed, 60))
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_slot_booking_within_hours() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS slot_bookings_keep_within_hours ON public.requestee_slot_bookings;
CREATE TRIGGER slot_bookings_keep_within_hours
  BEFORE INSERT OR UPDATE OF slot_id, case_id ON public.requestee_slot_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_slot_booking_within_hours();

CREATE OR REPLACE FUNCTION public.keep_booked_hours_within_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  needed numeric := CASE WHEN NEW.hours_requested > 0 THEN NEW.hours_requested * 60 ELSE 60 END;
  had numeric := CASE WHEN OLD.hours_requested > 0 THEN OLD.hours_requested * 60 ELSE 60 END;
  booked_slot uuid;
  minutes_left numeric;
BEGIN
  -- Fewer hours always fit.
  IF needed <= had THEN
    RETURN NEW;
  END IF;

  SELECT b.slot_id INTO booked_slot
    FROM public.requestee_slot_bookings b
   WHERE b.case_id = NEW.id;
  IF booked_slot IS NULL THEN
    RETURN NEW;
  END IF;

  -- The same edit can take the case out of its slot: rejected, archived while
  -- under review, or switched to in person, with an unpaid hold on a slot that
  -- hasn't started. cases_release_slot_booking (AFTER UPDATE) then frees it, so
  -- the new hours don't need to fit. These are that trigger's conditions.
  IF (   (NEW.admin_status = 'rejected' AND OLD.admin_status IS DISTINCT FROM 'rejected')
      OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.admin_status IN ('all', 'rejected'))
      OR (NEW.delivery_mode = 'offline' AND OLD.delivery_mode IS DISTINCT FROM 'offline'))
     AND EXISTS (
       SELECT 1
         FROM public.requestee_slot_bookings b
         JOIN public.requestee_time_slots s ON s.id = b.slot_id
        WHERE b.case_id = NEW.id AND b.paid_at IS NULL AND s.starts_at > now()
     ) THEN
    RETURN NEW;
  END IF;

  minutes_left := public.slot_minutes_left_for(booked_slot, NEW.id);
  IF minutes_left IS NOT NULL AND needed > minutes_left THEN
    RAISE EXCEPTION 'requestee_slot_full: % minutes left in this slot, % needed', round(greatest(minutes_left, 0)), round(needed)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_booked_hours_within_slot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cases_keep_booked_hours_within_slot ON public.cases;
CREATE TRIGGER cases_keep_booked_hours_within_slot
  BEFORE UPDATE OF hours_requested ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_booked_hours_within_slot();

-- -----------------------------------------------------------------------------
-- Self-check, on a new 3-hour slot and fresh copies of a firm's case (made as
-- postgres, then undone with everything else). A 1-hour and a 2-hour case fill
-- the slot; a third case is refused; the 1-hour case can't grow to 2 hours;
-- once the 2-hour case drops to 1 hour, the third case fits; and moving a
-- booking into the full slot is refused too. Skipped when no firm has a case to
-- copy.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  template_case uuid;
  test_slot uuid;
  other_slot uuid;
  one_hour uuid;
  two_hours uuid;
  third uuid;
  refused boolean;
BEGIN
  SELECT c.id INTO template_case
  FROM public.cases c
  WHERE c.user_id IS NOT NULL
  LIMIT 1;

  IF template_case IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.requestee_time_slots (starts_at, ends_at, note)
    VALUES (now() + interval '400 days', now() + interval '400 days 3 hours', 'self-check')
    RETURNING id INTO test_slot;
    INSERT INTO public.requestee_time_slots (starts_at, ends_at, note)
    VALUES (now() + interval '401 days', now() + interval '401 days 1 hour', 'self-check')
    RETURNING id INTO other_slot;

    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status, hours_requested)
    SELECT user_id, title, description, documentation_type, filters, 'current', 1
      FROM public.cases WHERE id = template_case
    RETURNING id INTO one_hour;
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status, hours_requested)
    SELECT user_id, title, description, documentation_type, filters, 'current', 2
      FROM public.cases WHERE id = template_case
    RETURNING id INTO two_hours;
    -- No hours given: 1 hour, as the receipt prices it.
    INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status, hours_requested)
    SELECT user_id, title, description, documentation_type, filters, 'current', NULL
      FROM public.cases WHERE id = template_case
    RETURNING id INTO third;

    -- 1 + 2 hours fill the 3-hour slot.
    INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since)
    VALUES (one_hour, test_slot, now()), (two_hours, test_slot, now());

    -- A third case doesn't fit.
    refused := false;
    BEGIN
      INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since) VALUES (third, test_slot, now());
    EXCEPTION WHEN check_violation THEN
      refused := SQLERRM LIKE 'requestee_slot_full%';
      IF NOT refused THEN RAISE; END IF;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'Self-check: a full slot took another booking; nothing changed';
    END IF;

    -- Nor does moving one into it from another slot.
    INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since) VALUES (third, other_slot, now());
    refused := false;
    BEGIN
      UPDATE public.requestee_slot_bookings SET slot_id = test_slot WHERE case_id = third;
    EXCEPTION WHEN check_violation THEN
      refused := SQLERRM LIKE 'requestee_slot_full%';
      IF NOT refused THEN RAISE; END IF;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'Self-check: a booking moved into a full slot; nothing changed';
    END IF;

    -- The 1-hour case can't grow into hours the slot doesn't have.
    refused := false;
    BEGIN
      UPDATE public.cases SET hours_requested = 2 WHERE id = one_hour;
    EXCEPTION WHEN check_violation THEN
      refused := SQLERRM LIKE 'requestee_slot_full%';
      IF NOT refused THEN RAISE; END IF;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'Self-check: a booked case grew past its slot; nothing changed';
    END IF;

    -- Going in person frees the hold, so more hours in the same edit are fine.
    UPDATE public.cases SET delivery_mode = 'offline', hours_requested = 2 WHERE id = one_hour;
    UPDATE public.cases SET delivery_mode = 'online', hours_requested = 1 WHERE id = one_hour;
    UPDATE public.requestee_slot_bookings SET slot_id = test_slot WHERE case_id = one_hour;

    -- Handing a booking to another case is counted too: the 1-hour case's
    -- booking can't go to a 2-hour case while the 2-hour one fills the rest.
    DELETE FROM public.requestee_slot_bookings WHERE case_id = third;
    UPDATE public.cases SET hours_requested = 2 WHERE id = third;
    refused := false;
    BEGIN
      UPDATE public.requestee_slot_bookings SET case_id = third WHERE case_id = one_hour;
    EXCEPTION WHEN check_violation THEN
      refused := SQLERRM LIKE 'requestee_slot_full%';
      IF NOT refused THEN RAISE; END IF;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'Self-check: a booking handed to a longer case overfilled its slot; nothing changed';
    END IF;
    UPDATE public.cases SET hours_requested = NULL WHERE id = third;
    INSERT INTO public.requestee_slot_bookings (case_id, slot_id, held_since) VALUES (third, other_slot, now());

    -- Shrinking frees hours, and then the third case fits.
    UPDATE public.cases SET hours_requested = 1 WHERE id = two_hours;
    UPDATE public.requestee_slot_bookings SET slot_id = test_slot WHERE case_id = third;
    IF (SELECT count(*) FROM public.requestee_slot_bookings WHERE slot_id = test_slot) <> 3 THEN
      RAISE EXCEPTION 'Self-check: freed hours could not be booked; nothing changed';
    END IF;

    RAISE EXCEPTION 'self-check: undo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'self-check: undo' THEN
      RAISE;
    END IF;
  END;
END $$;

COMMIT;

-- Verify: one row, reading false, true, true, true, true, false. Ends in LIMIT
-- because the SQL Editor adds "limit 100" to a SELECT that has none.
SELECT
  EXISTS (
    SELECT 1 FROM pg_constraint k
    WHERE k.conrelid = 'public.requestee_slot_bookings'::regclass
      AND k.conname = 'requestee_slot_bookings_slot_key'
  ) AS one_case_per_slot_still,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.requestee_slot_bookings'::regclass
      AND t.tgname = 'slot_bookings_keep_within_hours'
      AND t.tgenabled = 'O'
  ) AS booking_hours_trigger_enabled,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.cases'::regclass
      AND t.tgname = 'cases_keep_booked_hours_within_slot'
      AND t.tgenabled = 'O'
  ) AS case_hours_trigger_enabled,
  to_regclass('public.requestee_slot_bookings_slot_id_idx') IS NOT NULL AS slot_index_exists,
  (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = 'public.slot_minutes_left_for(uuid, uuid)'::regprocedure) AS counts_as_owner,
  has_function_privilege('authenticated', 'public.slot_minutes_left_for(uuid, uuid)', 'EXECUTE') AS signed_in_can_call_counter
LIMIT 1;
