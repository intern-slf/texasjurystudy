-- =============================================================================
-- SESSION WAITLIST
--
-- Once a session's accepted seats reach `participant_cap`, the next people to
-- accept land on a waitlist instead of being turned away. They receive the Zoom
-- link and hold in the waiting room for 15 minutes:
--
--   * called into the meeting  -> paid the normal hourly rate for the full
--                                 session length, and flipped to 'accepted'
--   * waited the full 15 min   -> paid a flat waiting fee, and left 'waitlisted'
--
-- Both outcomes are recorded by an admin from the session page; nothing here is
-- automatic, because the call-in happens in Zoom rather than in the app.
-- =============================================================================

-- How many waitlist slots a session offers. Mirrors participant_cap so it can be
-- varied per session later without a code change.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS waitlist_cap integer NOT NULL DEFAULT 2;

ALTER TABLE public.session_participants
  -- 1-based slot number, assigned in the order people accepted onto the
  -- waitlist. Kept after a call-in so we can still tell a promoted waitlister
  -- apart from someone who held a seat from the start.
  ADD COLUMN IF NOT EXISTS waitlist_position integer,
  -- NULL while the outcome is still undecided.
  ADD COLUMN IF NOT EXISTS waitlist_outcome text,
  ADD COLUMN IF NOT EXISTS waitlist_outcome_at timestamptz,
  -- What this person is owed for the session, in cents. Written when the amount
  -- becomes determinate: on accept for a seat, on outcome for a waitlister.
  ADD COLUMN IF NOT EXISTS payout_cents integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_participants_waitlist_outcome_check'
  ) THEN
    ALTER TABLE public.session_participants
      ADD CONSTRAINT session_participants_waitlist_outcome_check
      CHECK (waitlist_outcome IS NULL OR waitlist_outcome IN ('called_in', 'waited_out'));
  END IF;
END $$;

-- `invite_status` gains the value 'waitlisted'. The column has no CHECK
-- constraint, so no change is needed here — this comment is the record of it.
COMMENT ON COLUMN public.session_participants.invite_status IS
  'pending | accepted | declined | rejected | waitlisted. A waitlisted row holds a reserve slot; it becomes accepted if the person is called into the meeting.';

-- Counting accepted seats and waitlist slots happens on every accept, so keep
-- the per-session status lookup cheap.
CREATE INDEX IF NOT EXISTS session_participants_session_status_idx
  ON public.session_participants (session_id, invite_status);
