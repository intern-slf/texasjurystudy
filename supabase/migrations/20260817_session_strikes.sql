-- Associate no-show strikes with the session they happened in.
--
-- Before this, a strike was only a counter (jury_participants.flag_count), so
-- there was no way to tell which session a participant backed out of — and
-- clicking "Strike participant" twice for one no-show counted twice.
--
-- A strike is a property of one invite, so it lives on session_participants:
-- at most one per (session, participant), which is exactly the cardinality of
-- that table. flag_count stays as the denormalised counter that drives the
-- 3-strike auto-blacklist.
--
-- Additive and safe to re-run. Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS struck_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS struck_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.session_participants.struck_at IS
  'Set when an admin strikes this participant for not attending / backing out of THIS session. NULL = no strike.';
COMMENT ON COLUMN public.session_participants.struck_by IS
  'Admin who recorded the strike.';

-- Supports "which sessions was this participant struck in" (participant profile)
-- and the per-session roster lookup. Partial: struck rows are the rare case.
CREATE INDEX IF NOT EXISTS session_participants_struck_idx
  ON public.session_participants (participant_id, session_id)
  WHERE struck_at IS NOT NULL;

COMMIT;

-- NOTE: this migration only adds columns — existing flag_count values are left
-- untouched, so no participant gains or loses a strike and no blacklist state
-- changes. Until a strike is attributed to a session, those participants keep
-- their counter but show no per-session "Striked" badge.
--
-- Run 20260817_session_strikes_backfill.sql next to attribute the historical
-- strikes. It only touches participants where the attribution is forced (exactly
-- one invite, exactly one strike) — as of 2026-08-17 that covered all 5 flagged
-- accounts.
--
-- Sanity check after running:
--   select sp.session_id, sp.participant_id, sp.struck_at, jp.flag_count
--   from session_participants sp
--   join jury_participants jp on jp.user_id = sp.participant_id
--   where sp.struck_at is not null
--   order by sp.struck_at desc;
