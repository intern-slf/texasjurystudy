-- =============================================================================
-- OFFLINE (IN-PERSON) CASES
--
-- A case is now either run over Zoom ('online', the default and what every
-- existing row is) or in a physical room ('offline'). The two are priced,
-- staffed and communicated differently:
--
--   requestee pays     online  $850/hr + $100 per filter
--                      offline $10,000/hr + $100 per filter
--   participant earns  online  $30/hr   (+ $10 flat waitlist waiting fee)
--                      offline $100/hr  (no waitlist at all — nobody is asked
--                                        to travel to a room for a maybe)
--   how they join      online  a Zoom link  (sessions.zoom_link)
--                      offline an address   (sessions.location)
--
-- A session may not mix the two. There is one room and one Zoom link per
-- session, and the payout rate is a property of the session, so a mixed session
-- has no coherent answer for any of the three. That rule is enforced here in the
-- database as well as in the app, because cases are routinely attached and
-- swapped by hand from the SQL editor.
--
-- The session's mode is NOT stored on `sessions` — it is derived from the cases
-- attached to it, and the trigger below is what keeps that derivation
-- single-valued.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'online';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_delivery_mode_check'
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_delivery_mode_check
      CHECK (delivery_mode IN ('online', 'offline'));
  END IF;
END $$;

COMMENT ON COLUMN public.cases.delivery_mode IS
  'online | offline. online = Zoom focus group ($850/hr to the requestee, $30/hr to participants). offline = in-person focus group ($10,000/hr and $100/hr). Every case in a session must share one value — enforced by session_cases_single_delivery_mode.';

-- Where an in-person session physically happens. Mirrors `zoom_link`: one per
-- session, set by an admin, mailed to accepted participants. NULL for online
-- sessions and for offline sessions whose venue is not settled yet.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS location text;

COMMENT ON COLUMN public.sessions.location IS
  'Street address of an in-person session. The offline counterpart to zoom_link; only one of the two is ever meaningful for a given session.';

-- The mode of a session is a join away, and it is read on every accept, every
-- payout and every session-page render.
CREATE INDEX IF NOT EXISTS cases_delivery_mode_idx
  ON public.cases (delivery_mode);

-- ---------------------------------------------------------------------------
-- 2. No mixing inside a session
--
-- Fires on session_cases rather than on cases, because attaching a case is the
-- moment a conflict can be created. Deletes are always safe: removing a case can
-- only ever shrink the set of modes present.
--
-- SECURITY DEFINER, and read-only: the check must not depend on whether the
-- writer can SELECT the rows it compares. Admins can currently read every case,
-- so an invoker-rights function would work today — but a narrower policy later
-- would turn the lookup into NULL and silently wave the conflict through, which
-- is the one failure mode this trigger exists to prevent. search_path is pinned
-- because SECURITY DEFINER without it is resolvable by the caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_session_single_delivery_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  incoming_mode text;
  existing_mode text;
BEGIN
  -- A row with no session or no case cannot conflict with anything.
  IF NEW.session_id IS NULL OR NEW.case_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.delivery_mode INTO incoming_mode
    FROM public.cases c
   WHERE c.id = NEW.case_id;

  IF incoming_mode IS NULL THEN
    RETURN NEW; -- FK will reject a nonexistent case on its own
  END IF;

  -- Any already-attached case with a different mode, ignoring the row being
  -- updated so a plain time change never trips this.
  SELECT c.delivery_mode INTO existing_mode
    FROM public.session_cases sc
    JOIN public.cases c ON c.id = sc.case_id
   WHERE sc.session_id = NEW.session_id
     AND sc.id IS DISTINCT FROM NEW.id
     AND c.delivery_mode IS DISTINCT FROM incoming_mode
   LIMIT 1;

  IF existing_mode IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add a % case to this session: it already contains % case(s). An in-person session and an online session cannot share a slot — they have different venues, different participant pay rates, and only one of a Zoom link or an address.',
      incoming_mode, existing_mode
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_cases_single_delivery_mode ON public.session_cases;
CREATE TRIGGER session_cases_single_delivery_mode
  BEFORE INSERT OR UPDATE OF session_id, case_id ON public.session_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_session_single_delivery_mode();

-- ---------------------------------------------------------------------------
-- 3. A scheduled case's mode is frozen
--
-- Flipping delivery_mode on a case that already sits in a session would move the
-- session between price and payout regimes after people have accepted, and could
-- silently produce the mixed session the trigger above exists to prevent. Detach
-- the case first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_scheduled_case_delivery_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode
     AND EXISTS (SELECT 1 FROM public.session_cases sc WHERE sc.case_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'Cannot change this case from % to %: it is already scheduled into a session. Remove it from the session first.',
      OLD.delivery_mode, NEW.delivery_mode
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_lock_scheduled_delivery_mode ON public.cases;
CREATE TRIGGER cases_lock_scheduled_delivery_mode
  BEFORE UPDATE OF delivery_mode ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_scheduled_case_delivery_mode();
