-- =============================================================================
-- REQUESTEE TIME SLOTS
--
-- Admins publish times on a calendar (Requestees > Time Slots in the admin
-- panel) and law firms will pick one of them for their online focus group,
-- instead of only naming a preferred date on the new-case form. This migration
-- is the admin half: the table, and access for admins only.
--
-- No one else gets access to the table, now or later. When booking arrives,
-- firms will see open slots through the app's server, which hands out the
-- times without naming the firm that took one, since firms must not see each
-- other. Participants never see slots at all.
--
-- Times are instants (timestamptz). The admin enters and reads them as Central
-- Time; client/lib/requesteeTimeSlots.ts does the conversion.
--
-- Grants are explicit. Supabase stops granting new public tables to anon,
-- authenticated and service_role automatically on every project from
-- 2026-10-30, so the grants below keep the table reachable after that date. anon
-- gets nothing: no one signed out has any business here.
--
-- Run this BEFORE deploying the app change: the Time Slots page reads the table.
-- Safe to re-run. Run in Supabase SQL Editor.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.requestee_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- Optional label shown with the slot, e.g. "In person, Conroe".
  note text,
  -- The admin who added it. Kept as NULL if that login is ever deleted.
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requestee_time_slots_ends_after_start CHECK (ends_at > starts_at),
  CONSTRAINT requestee_time_slots_note_length CHECK (note IS NULL OR char_length(note) <= 200)
);

COMMENT ON TABLE public.requestee_time_slots IS
  'Times an admin has opened for law firms (requestees) to book an online focus group. Admin-only: firms will see open slots through the app server, never this table.';
COMMENT ON COLUMN public.requestee_time_slots.note IS
  'Optional label an admin adds to the slot, at most 200 characters. Firms will see it.';

-- The calendar reads one month at a time and the sidebar counts upcoming
-- slots, both by start time.
CREATE INDEX IF NOT EXISTS requestee_time_slots_starts_at_idx
  ON public.requestee_time_slots (starts_at);

-- Deleting a login looks up the slots it created.
CREATE INDEX IF NOT EXISTS requestee_time_slots_created_by_idx
  ON public.requestee_time_slots (created_by);

ALTER TABLE public.requestee_time_slots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.requestee_time_slots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.requestee_time_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.requestee_time_slots TO service_role;

-- Same admin check as sessions and session_cases. The SELECT wrapper lets
-- Postgres evaluate it once per query instead of once per row.
DROP POLICY IF EXISTS "admin can manage requestee_time_slots" ON public.requestee_time_slots;
CREATE POLICY "admin can manage requestee_time_slots"
  ON public.requestee_time_slots
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

COMMIT;
