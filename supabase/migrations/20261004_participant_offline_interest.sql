-- Ask participants whether they want in-person focus groups.
--
-- In-person sessions run at one venue (Heritage Plaza Office Suites, 402 Simonton
-- St, Conroe, TX 77301 — OFFLINE_VENUE in client/lib/constants/offline-catchment.ts).
-- Until now the only way to find out whether someone would travel there was to
-- invite them and see. The signup form now asks, and requires an answer; the
-- participant's own edit-profile form asks too and also requires one, so a
-- participant who signed up before this question existed answers it the next
-- time they save their profile.
--
-- 'Yes' / 'No' text like the other yes/no answers on this table (served_on_jury,
-- has_children, ...), so it reads the same everywhere. NULL means "not asked
-- yet": every existing row, rows added without a login, and anyone an admin
-- edits without answering for them. The app treats it as unanswered, never as No.
-- That is also why there is no NOT NULL — existing rows have no answer to give.
--
-- Participants write this column from the browser, so it must stay off the list
-- in protect_participant_admin_fields (F26). That trigger names the columns it
-- protects, so a new column is writable without touching it.
--
-- Run this BEFORE deploying the app change: the signup and edit forms send the
-- column, and PostgREST rejects a write to a column it doesn't know, so signup
-- would fail until it exists.
--
-- Additive and safe to re-run. Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.jury_participants
  ADD COLUMN IF NOT EXISTS interested_in_offline text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jury_participants_interested_in_offline_check'
  ) THEN
    ALTER TABLE public.jury_participants
      ADD CONSTRAINT jury_participants_interested_in_offline_check
      CHECK (interested_in_offline IN ('Yes', 'No'));
  END IF;
END $$;

COMMENT ON COLUMN public.jury_participants.interested_in_offline IS
  'Yes | No | NULL. The participant''s answer to "Are you interested in in-person focus groups?" at the Conroe venue. NULL = not answered yet (signed up before the question existed). Participant-editable.';

COMMIT;
