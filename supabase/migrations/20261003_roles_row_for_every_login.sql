-- Give every login a public.roles row, now and from here on.
--
-- Why: the app decides who someone is from public.roles in several places (the
-- login redirect, the admin layout, the admin Requestees list, blacklisting),
-- but nothing in the database made a roles row exist. Only the signup action
-- (client/app/auth/actions.ts) wrote one, in a separate call after createUser.
-- On 2026-10-03, 556 participant logins created between 2026-02-13 and
-- 2026-05-15 had no row, and neither did one law firm. The firm was missing
-- from the admin Requestees list, and four of those participants were
-- blacklisted on jury_participants.blacklisted_at but not in roles.
-- Those 557 rows were backfilled by hand the same day. Step 1 repeats that
-- backfill for any login still missing a row, and changes nothing on a
-- database that is already complete.
--
-- Step 2 adds an AFTER INSERT trigger on auth.users, so every new login gets
-- its row in the same transaction that creates it, whichever way it was
-- created: the signup form, a user added in the Supabase dashboard, or an
-- import script.
--
-- The role: only 'requestee' is read from user_metadata.role. Anything else,
-- including no role at all or 'admin', becomes 'participant'. user_metadata is
-- set by whoever creates the user, and anyone may already sign up as a
-- requestee through the form, so honouring 'requestee' grants nothing new.
-- 'admin' and 'blacklisted' are only ever set by an admin.
--
-- Deploy order: deploy the app first. The signup action used to INSERT the
-- roles row, which would collide with the row this trigger has already
-- written and fail every signup; it now upserts on user_id.
--
-- Safe to re-run. Run in Supabase SQL Editor.

BEGIN;

-- 1. Backfill any login that still has no roles row.
INSERT INTO public.roles (user_id, role, email)
SELECT u.id,
       CASE
         WHEN jp.blacklisted_at IS NOT NULL THEN 'blacklisted'
         WHEN u.raw_user_meta_data->>'role' = 'requestee' THEN 'requestee'
         ELSE 'participant'
       END,
       u.email
FROM auth.users u
LEFT JOIN public.jury_participants jp ON jp.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- 2. Write the row for every new login.
CREATE OR REPLACE FUNCTION public.assign_role_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.roles (user_id, role, email)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'requestee' THEN 'requestee' ELSE 'participant' END,
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_role_on_signup() IS
  'AFTER INSERT trigger on auth.users: gives every new login a public.roles row (requestee if user_metadata.role says so, otherwise participant). Never assigns admin or blacklisted.';

-- SECURITY DEFINER so it can write public.roles when auth creates the user.
-- A trigger needs no EXECUTE grant to fire, so nobody else gets one.
REVOKE ALL ON FUNCTION public.assign_role_on_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_role_on_signup() FROM anon, authenticated;

DROP TRIGGER IF EXISTS assign_role_on_signup ON auth.users;
CREATE TRIGGER assign_role_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_role_on_signup();

-- 3. Refuse to commit if any login is still without a row.
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = u.id);
  IF missing > 0 THEN
    RAISE EXCEPTION '% login(s) still have no roles row; nothing was changed', missing;
  END IF;
END $$;

COMMIT;

-- Check afterwards (both should come back as shown):
--   select count(*) from auth.users u
--   where not exists (select 1 from public.roles r where r.user_id = u.id);   -- 0
--
--   select tgname from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;             -- includes assign_role_on_signup
