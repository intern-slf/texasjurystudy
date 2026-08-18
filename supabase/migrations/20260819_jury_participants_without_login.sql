-- Expose "which participants have no login account" to the app.
--
-- Why this is needed: session_participants.participant_id has an FK onto
-- auth.users(id), and the whole participant experience is login-based — the
-- invite email's Accept link signs them in with a magic link, and accepting
-- requires a DL + PayPal profile they fill in on the participant dashboard.
--
-- A jury_participants row whose user_id has no auth.users row therefore can
-- never be invited: the INSERT fails with
--   insert or update on table "session_participants" violates foreign key
--   constraint "session_participants_participant_id_fkey" [23503]
-- Such rows exist (a profile created by hand or by import that never became a
-- login), and until now they were still offered by every candidate list, so an
-- admin could select one and the whole invite batch died on the FK.
--
-- The app cannot read auth.users through PostgREST, so it needs this helper.
-- SECURITY DEFINER because auth.users is not readable by any API role; it
-- returns ids only, never an email or any other auth column, and EXECUTE is
-- granted to service_role alone (the server-side admin client), so no browser
-- session can call it.
--
-- Additive and safe to re-run. Run in Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.jury_participants_without_login()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jp.user_id
  FROM public.jury_participants jp
  WHERE jp.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = jp.user_id
    );
$$;

COMMENT ON FUNCTION public.jury_participants_without_login() IS
  'jury_participants.user_id values with no auth.users row. These participants can never be invited (session_participants.participant_id FKs onto auth.users), so candidate lists and inviteParticipants filter them out. Service-role only.';

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; take it back and hand it
-- to the service role only.
REVOKE ALL ON FUNCTION public.jury_participants_without_login() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jury_participants_without_login() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jury_participants_without_login() TO service_role;

COMMIT;

-- Who this currently affects (2026-08-19: exactly one row, the "test 3" profile):
--   select jp.user_id, jp.first_name, jp.last_name, jp.email,
--          jp.reactivation_status, jp.blacklisted_at
--   from jury_participants jp
--   where jp.user_id in (select jury_participants_without_login())
--   order by jp.first_name;
--
-- A profile with no login is not a panel member and cannot be paid. Once the
-- list above is confirmed to be junk / abandoned rows, they can be removed:
--   delete from jury_participants where user_id = '<id>';
-- (Check `select * from session_participants where participant_id = '<id>'`
-- first — it will be empty, because the FK is what stopped those rows existing.)
