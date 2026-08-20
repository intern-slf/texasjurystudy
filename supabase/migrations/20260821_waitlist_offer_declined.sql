-- =============================================================================
-- WAITLIST OFFER CONSENT
--
-- An invitation email is written when seats are still free ("You have been
-- selected to participate"). If the session fills before the person replies,
-- clicking Accept used to drop them straight onto the waitlist — committing
-- them to a possible flat-fee outcome they never agreed to.
--
-- Accepting into a full session now shows the offer first and writes nothing
-- until they choose. Turning it down is recorded here, so the roster can say
-- "Declined — waitlist offer" rather than a plain no: refusing a reserve slot
-- is very different from refusing the session.
-- =============================================================================

ALTER TABLE public.session_participants
  DROP CONSTRAINT IF EXISTS session_participants_waitlist_outcome_check;

ALTER TABLE public.session_participants
  ADD CONSTRAINT session_participants_waitlist_outcome_check
  CHECK (
    waitlist_outcome IS NULL
    OR waitlist_outcome IN ('called_in', 'waited_out', 'offer_declined')
  );

COMMENT ON COLUMN public.session_participants.waitlist_outcome IS
  'called_in = admitted to the meeting from the waitlist; waited_out = held the full window and was not called; offer_declined = was offered a waitlist slot on accept and turned it down (invite_status is then declined, and they never occupied a slot).';
