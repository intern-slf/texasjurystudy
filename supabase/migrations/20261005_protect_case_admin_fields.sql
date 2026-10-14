-- Law firms can no longer set the fields only staff should on their own cases:
-- approval and rejection, the admin's proposed session time, and the assigned
-- requestee. And once a case is approved, a firm can change only what its
-- dashboard still offers on an approved case.
--
-- Why: the cases UPDATE policies ("user can update own cases", "user can soft
-- update own cases") let a firm write its own row from the browser with the
-- public anon key, and they limit rows, not columns (RLS audit F28,
-- docs/rls-policies.md). So a firm could approve its own case and skip review,
-- reject it or write its own rejection reason, propose its own session time, or
-- point requestee_id at another login (Admin/[caseId] then looks that login up
-- with the service role). After approval it could lower hours_requested or
-- switch delivery_mode, which the receipt is priced from, and once a session
-- time was set it could still clear its filters. The INSERT policies only check
-- user_id, so a new case could also start out approved.
--
-- Not closed here: any login, participants included, can still create a case
-- of its own (unreviewed), and the DELETE policy still lets a firm delete its
-- own case in any state. Both are listed as open under F28.
--
-- Unlike jury_participants (F26), admins write these columns through their own
-- login, not the service role: approve, reject, unapprove, propose a time, and
-- the session pages' scheduling all run as authenticated. So the trigger lets
-- through anyone public.caller_is_admin() says is an admin, as well as server
-- code (service role) and the SQL Editor (postgres); it acts only on
-- authenticated and anon callers who aren't admins. It doesn't rely on the
-- live public.is_admin(), which the policies use but no migration here defines.
--
-- What a firm (any non-admin) may still do:
--   UPDATE  Never change approved_at, admin_scheduled_at or requestee_id.
--           Change admin_status only from 'rejected' to 'all' ("Request Again"),
--           and rejection_reason only by clearing it in that same move.
--           Once a case is approved or submitted, change nothing except
--           schedule_status and scheduled_at (confirming or declining the
--           proposed time), status and deleted_at (archive, restore, and the
--           dashboard moving a case to Past once its time has passed), filters
--           and updated_at. filters is locked on every case once
--           admin_scheduled_at is set, as updateCaseFilters already does.
--   INSERT  Start as admin_status 'all', with approved_at, rejection_reason,
--           admin_scheduled_at and requestee_id NULL. The new-case form sends
--           none of these, so it gets the defaults.
--
-- Every write the firm dashboard makes still passes (client/app/dashboard/
-- requestee: the new-case insert and its Drive link, editing a requested case,
-- archive, restore, the move to Past, confirming or declining a time, Request
-- Again, filters), and admins pass, so this can be run before or after the app
-- deploy that ships with it. A column added to cases later is writable by firms
-- until a case is approved; an admin-only column must be added to the lists
-- below.
--
-- Checks itself before committing: acting as a firm that owns a case, it rolls
-- everything back unless saving the case unchanged still works and approving it
-- is refused (and, where such cases exist, Request Again and answering a
-- proposed time still work while editing an approved case's hours doesn't);
-- acting as an admin, unless a real change to the protected fields still works.
-- Every change it makes to try this is undone. Safe to re-run. Run in the
-- Supabase SQL Editor; the query at the end shows the result.

BEGIN;

-- Creating the trigger locks cases against writes until COMMIT. If something
-- else holds a lock on it, give up after 5 seconds rather than queue every
-- app query on cases behind this one.
SET LOCAL lock_timeout = '5s';

-- Refuse to run if a column the trigger names is missing (renamed or dropped):
-- it would silently stop protecting it, or start refusing a firm's own writes.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(col, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'admin_status', 'approved_at', 'rejection_reason', 'admin_scheduled_at', 'requestee_id',
    'schedule_status', 'scheduled_at', 'status', 'deleted_at', 'filters'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'cases' AND c.column_name = col
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'cases has no column %; nothing changed', missing;
  END IF;
END $$;

-- True when the signed-in caller has roles.role = 'admin'. SECURITY DEFINER, so
-- it reads roles whatever that table's policies say; the trigger below runs with
-- the caller's rights and calls it.
CREATE OR REPLACE FUNCTION public.caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.caller_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_case_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Set by staff only, whatever state the case is in.
  staff_only constant text[] := ARRAY['approved_at', 'admin_scheduled_at', 'requestee_id'];
  -- Everything a firm still changes on an approved or submitted case.
  after_approval constant text[] := ARRAY[
    'schedule_status', 'scheduled_at', 'status', 'deleted_at', 'filters', 'updated_at'
  ];
  new_row jsonb;
  old_row jsonb;
  request_again boolean;
  refused text[] := '{}';
  locked text[] := '{}';
  col text;
BEGIN
  -- Server code (service role) and the SQL Editor (postgres) aren't limited, and
  -- nor are admins on their own login. anon is never an admin, and can't call
  -- caller_is_admin(): nested rather than ANDed, because the permission to call
  -- a function is checked when the expression is set up, not when it runs.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF current_user = 'authenticated' THEN
    IF public.caller_is_admin() THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.admin_status IS DISTINCT FROM 'all' THEN
      refused := array_append(refused, 'admin_status');
    END IF;
    IF NEW.approved_at IS NOT NULL THEN
      refused := array_append(refused, 'approved_at');
    END IF;
    IF NEW.rejection_reason IS NOT NULL THEN
      refused := array_append(refused, 'rejection_reason');
    END IF;
    IF NEW.admin_scheduled_at IS NOT NULL THEN
      refused := array_append(refused, 'admin_scheduled_at');
    END IF;
    IF NEW.requestee_id IS NOT NULL THEN
      refused := array_append(refused, 'requestee_id');
    END IF;
  ELSE
    new_row := to_jsonb(NEW);
    old_row := to_jsonb(OLD);

    FOREACH col IN ARRAY staff_only LOOP
      IF new_row -> col IS DISTINCT FROM old_row -> col THEN
        refused := array_append(refused, col);
      END IF;
    END LOOP;

    -- "Request Again": a rejected case goes back to the queue, reason cleared.
    request_again := OLD.admin_status IS NOT DISTINCT FROM 'rejected'
                 AND NEW.admin_status IS NOT DISTINCT FROM 'all';
    IF NEW.admin_status IS DISTINCT FROM OLD.admin_status AND NOT request_again THEN
      refused := array_append(refused, 'admin_status');
    END IF;
    IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       AND NOT (request_again AND NEW.rejection_reason IS NULL) THEN
      refused := array_append(refused, 'rejection_reason');
    END IF;

    -- An approved case is what the admin approved.
    IF OLD.admin_status IN ('approved', 'submitted') THEN
      FOR col IN SELECT jsonb_object_keys(new_row) LOOP
        IF NOT (col = ANY (after_approval)) AND NOT (col = ANY (refused))
           AND new_row -> col IS DISTINCT FROM old_row -> col THEN
          locked := array_append(locked, col);
        END IF;
      END LOOP;
    END IF;

    -- Filters set the price and the candidate list, and stop being the firm's to
    -- change once a session is scheduled.
    IF OLD.admin_scheduled_at IS NOT NULL
       AND new_row -> 'filters' IS DISTINCT FROM old_row -> 'filters' THEN
      locked := array_append(locked, 'filters');
    END IF;
  END IF;

  IF cardinality(refused) > 0 THEN
    RAISE EXCEPTION 'Only staff can set % on a case.', array_to_string(refused, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF cardinality(locked) > 0 THEN
    RAISE EXCEPTION 'Only staff can change % once a case is approved or scheduled.', array_to_string(locked, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_protect_admin_fields ON public.cases;
CREATE TRIGGER cases_protect_admin_fields
  BEFORE INSERT OR UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_case_admin_fields();

-- Self-check, as the browser sessions of a firm and of an admin would run.
-- Changes made only to prove they are allowed are undone by raising
-- self_check_undo (SQLSTATE TJS01) inside their own block, so nothing here is
-- kept. Rolls everything back if any check fails.
DO $$
DECLARE
  firm uuid;
  firm_case uuid;
  rejected_owner uuid;
  rejected_case uuid;
  approved_owner uuid;
  approved_case uuid;
  staff uuid;
  changed integer;
BEGIN
  -- Looked up first, as postgres: once acting as a user, RLS hides other rows.
  SELECT c.id, c.user_id INTO firm_case, firm
  FROM public.cases c
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = c.user_id AND r.role = 'admin')
  ORDER BY c.admin_status = 'approved', c.created_at DESC
  LIMIT 1;

  SELECT c.id, c.user_id INTO rejected_case, rejected_owner
  FROM public.cases c
  WHERE c.admin_status = 'rejected'
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = c.user_id AND r.role = 'admin')
  LIMIT 1;

  SELECT c.id, c.user_id INTO approved_case, approved_owner
  FROM public.cases c
  WHERE c.admin_status IN ('approved', 'submitted')
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.user_id = c.user_id AND r.role = 'admin')
  LIMIT 1;

  SELECT r.user_id INTO staff FROM public.roles r WHERE r.role = 'admin' LIMIT 1;

  SET LOCAL ROLE authenticated;

  -- A firm: saving its own case unchanged works, approving it doesn't.
  IF firm_case IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', firm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', firm::text, true);

    BEGIN
      UPDATE public.cases SET title = title WHERE id = firm_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not save its own case unchanged (% rows); nothing changed', changed;
      END IF;
      RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
    EXCEPTION WHEN SQLSTATE 'TJS01' THEN
      NULL;
    END;

    -- Creating a case still works when it starts unreviewed, and is refused
    -- when it starts approved. Copies the firm's own case's required fields,
    -- so the row is one it could create; anything production adds on insert
    -- (a default, another trigger) is exercised too.
    BEGIN
      INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status)
      SELECT firm, title, description, documentation_type, filters, 'current'
      FROM public.cases WHERE id = firm_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not create a case (% rows); nothing changed', changed;
      END IF;
      RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
    EXCEPTION WHEN SQLSTATE 'TJS01' THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.cases (user_id, title, description, documentation_type, filters, status, admin_status)
      SELECT firm, title, description, documentation_type, filters, 'current', 'approved'
      FROM public.cases WHERE id = firm_case;
      RAISE EXCEPTION 'Self-check: a firm could create a case that starts approved; nothing changed';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'Only staff can set admin_status%' THEN
        RAISE;
      END IF;
    END;

    BEGIN
      UPDATE public.cases
         SET admin_status = CASE WHEN admin_status = 'approved' THEN 'submitted' ELSE 'approved' END
       WHERE id = firm_case;
      RAISE EXCEPTION 'Self-check: a firm could still approve its own case; nothing changed';
    EXCEPTION WHEN insufficient_privilege THEN
      -- Only this trigger's refusal counts; any other permission error is real.
      IF SQLERRM NOT LIKE 'Only staff can set admin_status%' THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- A firm's Request Again on its rejected case still works.
  IF rejected_case IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', rejected_owner, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', rejected_owner::text, true);
    BEGIN
      UPDATE public.cases SET admin_status = 'all', rejection_reason = NULL WHERE id = rejected_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not ask again on its rejected case (% rows); nothing changed', changed;
      END IF;
      RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
    EXCEPTION WHEN SQLSTATE 'TJS01' THEN
      NULL;
    END;
  END IF;

  -- On an approved case: answering the proposed time still works, changing the
  -- hours it is priced from doesn't.
  IF approved_case IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', approved_owner, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', approved_owner::text, true);
    BEGIN
      UPDATE public.cases
         SET schedule_status = CASE WHEN schedule_status = 'accepted' THEN 'rejected' ELSE 'accepted' END,
             scheduled_at = coalesce(admin_scheduled_at, scheduled_at, now()) + interval '1 minute'
       WHERE id = approved_case;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: a firm could not answer the proposed time on its approved case (% rows); nothing changed', changed;
      END IF;
      RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
    EXCEPTION WHEN SQLSTATE 'TJS01' THEN
      NULL;
    END;

    BEGIN
      UPDATE public.cases SET hours_requested = coalesce(hours_requested, 0) + 1 WHERE id = approved_case;
      RAISE EXCEPTION 'Self-check: a firm could still change the hours on its approved case; nothing changed';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE 'Only staff can change hours_requested%' THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- An admin, on their own login: a real change to the protected fields works.
  IF staff IS NOT NULL AND coalesce(firm_case, approved_case, rejected_case) IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', staff::text, true);
    BEGIN
      UPDATE public.cases
         SET admin_status = CASE WHEN admin_status = 'approved' THEN 'all' ELSE 'approved' END,
             approved_at = now(),
             rejection_reason = 'self-check',
             admin_scheduled_at = coalesce(admin_scheduled_at, now()) + interval '1 day'
       WHERE id = coalesce(firm_case, approved_case, rejected_case);
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN
        RAISE EXCEPTION 'Self-check: an admin could not change a case (% rows); nothing changed', changed;
      END IF;
      RAISE EXCEPTION 'self_check_undo' USING ERRCODE = 'TJS01';
    EXCEPTION WHEN SQLSTATE 'TJS01' THEN
      NULL;
    END;
  END IF;

  RESET ROLE;
END $$;

COMMIT;

-- Verify: one row, reading true, true, true, false. Every query here ends in
-- LIMIT because the SQL Editor adds "limit 100" to a SELECT that has none.
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.cases'::regclass
      AND t.tgname = 'cases_protect_admin_fields'
      AND t.tgenabled = 'O'
  ) AS trigger_enabled,
  p.prosecdef AS caller_is_admin_runs_as_owner,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in_can_call_it,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_call_it
FROM pg_proc p
WHERE p.oid = 'public.caller_is_admin()'::regprocedure
LIMIT 1;

-- Afterwards, worth a look once (F28 closed these too, in the app):
--
-- Cases pointed at a requestee other than their creator. Only staff set this, by
-- hand; anything unexpected may be a firm aiming the admin case page at someone:
--   SELECT id, user_id, requestee_id, admin_status FROM public.cases
--   WHERE requestee_id IS NOT NULL ORDER BY created_at DESC LIMIT 50;
--
-- Files and Drive links someone attached to a case they don't own (planted
-- before uploadCaseDocument and addDriveLink checked ownership):
--   SELECT d.id, d.case_id, d.uploaded_by, d.original_name FROM public.case_documents d
--   JOIN public.cases c ON c.id = d.case_id
--   WHERE d.uploaded_by <> c.user_id AND d.uploaded_by IS DISTINCT FROM c.requestee_id
--   LIMIT 50;
--
--   SELECT l.id, l.case_id, l.uploaded_by, l.url FROM public.case_drive_links l
--   JOIN public.cases c ON c.id = l.case_id
--   WHERE l.uploaded_by <> c.user_id AND l.uploaded_by IS DISTINCT FROM c.requestee_id
--   LIMIT 50;
