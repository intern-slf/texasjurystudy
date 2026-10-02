-- Law-firm (requestee / reviewer) logins get no direct read access to
-- participant records.
--
-- Three policies let a requestee's own login query participant tables straight
-- from the browser with the public anon key, every column included: phone,
-- street address, date of birth, ID number, PayPal username.
--   - jury_participants "requestee can read jury participants": every row, for
--     any requestee or reviewer (RLS audit F14, docs/rls-policies.md).
--   - jury_participants "Requestees can view participants in their sessions":
--     every column of anyone invited to their sessions. Its USING also carries
--     the participant self-read and admin-read terms, which the two policies
--     kept below already cover.
--   - oldData "requestee can read oldData": every legacy participant row (F4).
--
-- The app no longer reads these tables as a requestee. Requestee screens get
-- participant data from server code (client/lib/participant/requesteeAccess.ts),
-- which checks the participant is on the firm's own case and returns only the
-- fields privacy policy section 6 lists. Kept: participants read their own row,
-- admins read every row.
--
-- Run in the Supabase SQL Editor AFTER the app change is deployed. Until then
-- the old requestee screens read these tables with the requestee's login and
-- would show "Unknown" names and an empty participant search. Safe to re-run.

BEGIN;

-- Refuse to run if the policies that keep participant self-reads and admin reads
-- working are missing, instead of locking those out along with requestees.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jury_participants'
      AND policyname = 'Users can view their own participant profile'
  ) THEN
    RAISE EXCEPTION 'jury_participants: "Users can view their own participant profile" is missing; nothing changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jury_participants'
      AND policyname = 'admin read jury participants'
  ) THEN
    RAISE EXCEPTION 'jury_participants: "admin read jury participants" is missing; nothing changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'oldData'
      AND policyname = 'admin can read all oldData'
  ) THEN
    RAISE EXCEPTION 'oldData: "admin can read all oldData" is missing; nothing changed';
  END IF;
END $$;

DROP POLICY IF EXISTS "requestee can read jury participants" ON public.jury_participants;
DROP POLICY IF EXISTS "Requestees can view participants in their sessions" ON public.jury_participants;
DROP POLICY IF EXISTS "requestee can read oldData" ON public."oldData";

-- Check nothing else still opens these rows to a requestee, or to everyone: a
-- policy added in the dashboard and never written down here would undo this.
-- Rolls the whole migration back and names the policy if one is found.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(format('%s: "%s"', tablename, policyname), '; ')
    INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('jury_participants', 'oldData')
    AND cmd IN ('SELECT', 'ALL')
    AND (
      qual ILIKE '%requestee%'
      OR qual ILIKE '%reviewer%'
      OR btrim(qual) = 'true'
      OR 'anon' = ANY (roles)
    );
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Still readable beyond the participant and admins: %', leftover;
  END IF;
END $$;

COMMIT;

-- To confirm afterwards, this should list only the participant self-read and
-- admin-read SELECT policies (plus INSERT / UPDATE ones):
--   SELECT tablename, policyname, cmd, roles, qual
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('jury_participants', 'oldData')
--   ORDER BY tablename, cmd, policyname;
