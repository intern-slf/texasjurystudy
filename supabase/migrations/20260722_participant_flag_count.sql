-- No-show strike system: track how many times a participant accepted a session
-- invite and then backed out. At 3 flags the participant is auto-blacklisted
-- (handled in application code). Additive column, safe to re-run.
-- Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.jury_participants
  ADD COLUMN IF NOT EXISTS flag_count integer NOT NULL DEFAULT 0;

COMMIT;
