-- Rename role/identifiers: presenter -> requestee
-- Run in Supabase SQL Editor on 2026-05-18.
-- The "Notify Presenter" admin flow keeps the 'presenter' wording in code only;
-- there is no DB row tied to that flow, so this migration renames everything DB-side.

BEGIN;

-- ============================================================================
-- 0. PRE-FLIGHT (uncomment to inspect before committing)
-- ============================================================================
-- SELECT role, count(*) FROM public.roles GROUP BY role;
-- SELECT count(*) FROM auth.users WHERE raw_user_meta_data->>'role' = 'presenter';
-- SELECT count(*) FROM public.cases WHERE presenter_id IS NOT NULL;

-- ============================================================================
-- 1. Loosen roles.role CHECK constraint to allow both values during migration
-- ============================================================================
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.roles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.roles DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_role_check
  CHECK (role IN ('participant','presenter','requestee','admin','blacklisted'));

-- ============================================================================
-- 2. Migrate public.roles values
-- ============================================================================
UPDATE public.roles SET role = 'requestee' WHERE role = 'presenter';

-- ============================================================================
-- 3. Tighten constraint to final shape (drop 'presenter')
-- ============================================================================
ALTER TABLE public.roles DROP CONSTRAINT roles_role_check;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_role_check
  CHECK (role IN ('participant','requestee','admin','blacklisted'));

-- ============================================================================
-- 4. Migrate auth.users user_metadata.role
-- ============================================================================
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"requestee"')
WHERE raw_user_meta_data->>'role' = 'presenter';

-- ============================================================================
-- 5. Update RLS policies whose BODIES reference the role string 'presenter'
--    (must DROP+CREATE; policy body cannot be ALTERed in place)
-- ============================================================================
DROP POLICY IF EXISTS "presenter can read oldData" ON public."oldData";
CREATE POLICY "requestee can read oldData"
  ON public."oldData"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles
      WHERE roles.user_id = auth.uid()
        AND roles.role = 'requestee'
    )
  );

DROP POLICY IF EXISTS "presenter can read jury participants" ON public.jury_participants;
CREATE POLICY "requestee can read jury participants"
  ON public.jury_participants
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.roles
      WHERE roles.user_id = auth.uid()
        AND roles.role IN ('requestee','reviewer')
    )
  );

-- ============================================================================
-- 6. Rename column cases.presenter_id -> cases.requestee_id
--    Policy bodies referencing this column auto-update (Postgres tracks by OID).
-- ============================================================================
ALTER TABLE public.cases RENAME COLUMN presenter_id TO requestee_id;

-- ============================================================================
-- 7. Rename table confidentiality_agreements_presenter
-- ============================================================================
ALTER TABLE public.confidentiality_agreements_presenter
  RENAME TO confidentiality_agreements_requestee;

-- ============================================================================
-- 8. Rename policy NAMES that still contain 'presenter'.
--    Bodies were auto-updated by the column/table renames above.
-- ============================================================================
ALTER POLICY "presenter can read own sessions"
  ON public.sessions
  RENAME TO "requestee can read own sessions";

ALTER POLICY "presenter can read session_cases of own cases"
  ON public.session_cases
  RENAME TO "requestee can read session_cases of own cases";

ALTER POLICY "presenter can read session participants of own cases"
  ON public.session_participants
  RENAME TO "requestee can read session participants of own cases";

ALTER POLICY "Presenters can view participants in their sessions"
  ON public.jury_participants
  RENAME TO "Requestees can view participants in their sessions";

ALTER POLICY "presenter can read participants of own cases"
  ON public.profiles
  RENAME TO "requestee can read participants of own cases";

ALTER POLICY "presenter can create case"
  ON public.cases
  RENAME TO "requestee can create case";

ALTER POLICY "presenter can read own cases"
  ON public.cases
  RENAME TO "requestee can read own cases";

ALTER POLICY "Presenter manages own drive links"
  ON public.case_drive_links
  RENAME TO "Requestee manages own drive links";

ALTER POLICY "presenter can insert own agreement"
  ON public.confidentiality_agreements_requestee
  RENAME TO "requestee can insert own agreement";

ALTER POLICY "presenter can read own agreement"
  ON public.confidentiality_agreements_requestee
  RENAME TO "requestee can read own agreement";

-- ============================================================================
-- 9. POST-FLIGHT (uncomment to verify before COMMIT)
-- ============================================================================
-- SELECT role, count(*) FROM public.roles GROUP BY role;                  -- expect no 'presenter'
-- SELECT count(*) FROM auth.users WHERE raw_user_meta_data->>'role' = 'presenter'; -- expect 0
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='cases' AND column_name IN ('presenter_id','requestee_id');
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'confidentiality_agreements%';
-- SELECT polname FROM pg_policy WHERE polname ILIKE '%presenter%';        -- expect 0 rows

COMMIT;

-- NOTE: FK constraint names (e.g. cases_presenter_id_fkey) and index names are
-- NOT auto-renamed and are cosmetic. Leave as-is for now; rename later if desired.
