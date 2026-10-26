-- New participants start active.
--
-- What was wrong: only reactivation_status 'yes' may be invited to or accept a
-- session (client/lib/participant/activeStatus.ts), and the only thing that set
-- 'yes' was the "are you still interested?" reactivation email. A new profile
-- took the column default, 'pending', and the F26 trigger
-- (20261003_protect_participant_admin_fields.sql) refused a browser insert with
-- 'yes'. The last campaign email went out on 2026-08-24, so everyone who signed
-- up since then sat at 'pending': shown as not active in the admin table, left
-- out of every candidate list, and refused if they tried to accept. On
-- 2026-10-27 that was 46 people (2 from July, 20 from September, 24 from
-- October).
--
-- 'yes' means we have a current confirmation that the person wants to take
-- part. Filling in the signup form is that confirmation, just as clicking Yes in
-- the email is. So a profile a participant creates themselves now starts 'yes',
-- confirmed at signup.
--
-- How: the F26 trigger already runs on every browser insert. On INSERT by
-- authenticated or anon it no longer refuses 'yes'; it sets the four
-- reactivation fields itself, whatever the client sent: 'yes', confirmed now, no
-- email sent, no deadline. Nothing else changes. A participant still can't
-- approve themselves (approval is what puts them on candidate lists), start with
-- strikes, or change any of these fields afterwards, so someone who answered No
-- or unsubscribed stays that way. Rows written by server code or the SQL Editor
-- (imports) keep the column default, 'pending', as before.
--
-- The profile form only appears while a participant has no row
-- (client/app/dashboard/participant/page.tsx), so its upsert is the signup. If
-- it ever hits an existing row, the ON CONFLICT update sets only the columns the
-- form sends, which never include the reactivation fields, so the values set
-- here are discarded and the existing status stands.
--
-- Backfill: participants who signed up since the first reactivation email
-- (2026-05-28) and were never sent one, so were never asked. They are marked
-- 'yes' as of their signup (entry_date, which the signup form writes once, in
-- UTC). Older 'pending' rows were part of the campaign or predate it and are
-- left alone.
--
-- Replaces the trigger function and re-creates the trigger, so it works whether
-- or not 20261003 has been run, and keeps everything that one protects. Checks
-- itself before committing: acting as a participant creating their profile, it
-- rolls everything back unless the new profile comes out 'yes' and the
-- participant still can't change it. Safe to re-run. Run in Supabase SQL Editor.
--
-- Who the backfill will change (run first to preview):
--   select user_id, first_name, last_name, email, entry_date
--   from jury_participants
--   where reactivation_status = 'pending'
--     and reactivation_email_sent_at is null
--     and entry_date >= '2026-05-28'
--   order by entry_date;

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

    -- Signing up is the participant telling us they want to take part, the same
    -- answer as Yes in the reactivation email, so a new profile starts active.
    -- Set here rather than taken from the client.
    NEW.reactivation_status := 'yes';
    NEW.reactivation_confirmed_at := now();
    NEW.reactivation_email_sent_at := NULL;
    NEW.reactivation_deadline_at := NULL;
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

-- Backfill the participants who signed up while new profiles started 'pending'.
UPDATE public.jury_participants
   SET reactivation_status = 'yes',
       reactivation_confirmed_at = entry_date AT TIME ZONE 'UTC'
 WHERE reactivation_status = 'pending'
   AND reactivation_email_sent_at IS NULL
   AND entry_date >= '2026-05-28';

-- Self-check, as a participant's browser session creating their profile would
-- run: the new profile starts 'yes' even though it asked for 'no', and the
-- participant can't change it afterwards. Uses a login with no profile yet (so
-- any check on user_id holds) and a copy of an adult's profile for the other
-- required fields. The test profile is always undone, along with anything its
-- insert set off, by failing its own block on purpose; a failed check rolls
-- everything back.
DO $$
DECLARE
  newcomer uuid;
  profile public.jury_participants;
  started text;
  confirmed boolean;
BEGIN
  SELECT u.id INTO newcomer
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.jury_participants jp WHERE jp.user_id = u.id)
  LIMIT 1;

  SELECT * INTO profile
  FROM public.jury_participants
  WHERE date_of_birth <= current_date - interval '18 years'
  LIMIT 1;

  IF newcomer IS NULL OR profile.user_id IS NULL THEN
    RAISE NOTICE 'Self-check skipped: no login without a profile, or no adult profile to copy';
    RETURN;
  END IF;

  profile.id := gen_random_uuid();
  profile.user_id := newcomer;
  profile.email := newcomer::text || '@self-check.invalid';
  profile.driver_license_number := NULL;
  profile.driver_license_image_url := NULL;
  profile.paypal_username := NULL;
  profile.approved_by_admin := false;
  profile.flag_count := 0;
  profile.blacklisted_at := NULL;
  profile.blacklist_reason := NULL;
  profile.eligible_after_at := NULL;
  profile.reactivation_status := 'no';
  profile.reactivation_confirmed_at := NULL;
  profile.reactivation_email_sent_at := NULL;
  profile.reactivation_deadline_at := NULL;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', newcomer, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', newcomer::text, true);
    SET LOCAL ROLE authenticated;

    INSERT INTO public.jury_participants VALUES (profile.*);

    BEGIN
      UPDATE public.jury_participants SET reactivation_status = 'pending' WHERE user_id = newcomer;
      RAISE EXCEPTION 'Self-check: a participant could change their own reactivation_status; nothing changed';
    EXCEPTION WHEN insufficient_privilege THEN
      -- Only this trigger's refusal counts; any other permission error is real.
      IF SQLERRM NOT LIKE 'Only staff can set reactivation_status%' THEN
        RAISE;
      END IF;
    END;

    RESET ROLE;
    SELECT reactivation_status, reactivation_confirmed_at IS NOT NULL
      INTO started, confirmed
    FROM public.jury_participants
    WHERE user_id = newcomer;

    -- Undo the test profile (and the role and claims set above).
    RAISE EXCEPTION 'self-check done' USING ERRCODE = 'TJS01';
  EXCEPTION WHEN SQLSTATE 'TJS01' THEN
    NULL;
  END;

  IF started IS DISTINCT FROM 'yes' OR NOT confirmed THEN
    RAISE EXCEPTION 'Self-check: a new profile started as % instead of yes; nothing changed', coalesce(started, 'nothing');
  END IF;
END $$;

COMMIT;
