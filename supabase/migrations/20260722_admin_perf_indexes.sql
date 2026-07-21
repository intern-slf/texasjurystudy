-- Add indexes on the foreign-key / status columns the Admin dashboard joins and
-- filters on. None of these existed (only PK/UNIQUE constraints did), so the
-- admin pages were doing sequential scans on every per-session / per-case query.
-- Purely additive — no schema or behavior change. Run in Supabase SQL Editor.

BEGIN;

-- Sessions page: per-session session_cases lookups + the "already scheduled" set
CREATE INDEX IF NOT EXISTS session_cases_session_id_idx
  ON public.session_cases (session_id);
CREATE INDEX IF NOT EXISTS session_cases_case_id_idx
  ON public.session_cases (case_id);

-- Sessions page: per-session participant lookups (both join directions)
CREATE INDEX IF NOT EXISTS session_participants_session_id_idx
  ON public.session_participants (session_id);
CREATE INDEX IF NOT EXISTS session_participants_participant_id_idx
  ON public.session_participants (participant_id);

-- Cases page + admin layout: status filters (.in("admin_status", ...))
CREATE INDEX IF NOT EXISTS cases_admin_status_idx
  ON public.cases (admin_status);

-- case-lineage.ts: ancestor/descendant walks over the follow-up chain
CREATE INDEX IF NOT EXISTS cases_parent_case_id_idx
  ON public.cases (parent_case_id);

-- Cases pages: nested case_documents fetches by case
CREATE INDEX IF NOT EXISTS case_documents_case_id_idx
  ON public.case_documents (case_id);

-- Repeated role lookups, incl. role='blacklisted' candidate exclusion
CREATE INDEX IF NOT EXISTS roles_role_idx
  ON public.roles (role);

COMMIT;
