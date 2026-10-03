-- Participants can no longer set the fields only staff and the server should:
-- admin approval, the blacklist, strikes, the cooldown between sessions, and the
-- reactivation campaign's status and dates.
--
-- Why: "Users can update their own participant profile" lets a participant write
-- their own jury_participants row from the browser with the public anon key, and
-- it limits rows, not columns (RLS audit F26, docs/rls-policies.md). So a
-- participant could set approved_by_admin = true, which every invite path
-- requires, clear eligible_after_at to skip the cooldown after a session, clear
-- their blacklist fields, or put flag_count back to 0. The INSERT policies only
-- check user_id, so a new profile could also start out approved, or with a
-- negative strike count that the three-strike blacklist never reaches.
--
-- Nothing in the app writes these from the browser. Approval, blacklists,
-- strikes, the cooldown and the reactivation campaign all go through server code
-- with the service role, and the SQL Editor runs as postgres; neither is limited
-- here. Only authenticated and anon, the roles a browser request runs as, are.
-- So this needs no app change and can be run at any time.
--
-- A trigger rather than column grants: it names only the fields to protect, so a
-- participant field added later needs no grant, and it covers the upsert the
-- signup form sends. Same approach as jury_participants_adult_dob
-- (20260929_adult_date_of_birth.sql).
--
-- An UPDATE may not change any of them. An INSERT may not start approved, active
-- (reactivation_status 'yes', which every session requires) or with strikes; new
-- profiles start 'pending' and get 'yes' from the reactivation email link. The
-- other fields are left to the table's defaults, since setting them gains nothing.
--
-- Checks itself before committing: acting as one participant, it rolls
-- everything back unless they can still save their own profile but can no
-- longer approve themselves. Safe to re-run. Run in Supabase SQL Editor.

BEGIN;

-- Refuse to run if a protected column is missing (renamed or dropped): the
-- trigger would silently stop protecting it.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(col, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'approved_by_admin', 'blacklisted_at', 'blacklist_reason', 'flag_count',
    'eligible_after_at', 'reactivation_status', 'reactivation_email_sent_at',
    'reactivation_confirmed_at', 'reactivation_deadline_at'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'jury_participants' AND c.column_name = col
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'jury_participants has no column %; nothing changed', missing;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_participant_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  protected constant text[] := ARRAY[
    'approved_by_admin', 'blacklisted_at', 'blacklist_reason', 'flag_count',
    'eligible_after_at', 'reactivation_status', 'reactivation_email_sent_at',
    'reactivation_confirmed_at', 'reactivation_deadline_at'
  ];
  refused text[] := '{}';
  col text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH col IN ARRAY protected LOOP
      IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
        refused := array_append(refused, col);
      END IF;
    END LOOP;
  ELSE
    IF NEW.approved_by_admin IS TRUE THEN
      refused := array_append(refused, 'approved_by_admin');
    END IF;
    IF coalesce(NEW.flag_count, 0) <> 0 THEN
      refused := array_append(refused, 'flag_count');
    END IF;
    IF NEW.reactivation_status = 'yes' THEN
      refused := array_append(refused, 'reactivation_status');
    END IF;
  END IF;

  IF cardinality(refused) > 0 THEN
    RAISE EXCEPTION 'Only staff can set % on a participant profile.', array_to_string(refused, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jury_participants_protect_admin_fields ON public.jury_participants;
CREATE TRIGGER jury_participants_protect_admin_fields
  BEFORE INSERT OR UPDATE ON public.jury_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_participant_admin_fields();

-- Self-check, as one participant's browser session would run: saving their own
-- profile still works, approving themselves doesn't. Rolls everything back
-- otherwise.
DO $$
DECLARE
  someone uuid;
  saved integer;
BEGIN
  SELECT user_id INTO someone FROM public.jury_participants LIMIT 1;
  IF someone IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', someone, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', someone::text, true);
  SET LOCAL ROLE authenticated;

  UPDATE public.jury_participants SET first_name = first_name WHERE user_id = someone;
  GET DIAGNOSTICS saved = ROW_COUNT;
  IF saved <> 1 THEN
    RAISE EXCEPTION 'Self-check: a participant could not save their own profile (% rows); nothing changed', saved;
  END IF;

  BEGIN
    UPDATE public.jury_participants
       SET approved_by_admin = NOT coalesce(approved_by_admin, false)
     WHERE user_id = someone;
    RAISE EXCEPTION 'Self-check: a participant could still change approved_by_admin; nothing changed';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Only this trigger's refusal counts; any other permission error is real.
    IF SQLERRM NOT LIKE 'Only staff can set approved_by_admin%' THEN
      RAISE;
    END IF;
  END;

  RESET ROLE;
END $$;

COMMIT;
