-- Participant reactivation campaign
-- Adds an active-status flag plus the timestamps needed to track who responded
-- to the "are you still interested?" email and when the 30-day deadline lapses.
-- Default is_active=false: every existing participant starts inactive and only
-- flips to true after they click the magic-link CTA in the reactivation email.

BEGIN;

ALTER TABLE public.jury_participants
  ADD COLUMN IF NOT EXISTS is_active                  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reactivation_email_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reactivation_confirmed_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reactivation_deadline_at   timestamptz NULL;

CREATE INDEX IF NOT EXISTS jury_participants_is_active_idx
  ON public.jury_participants (is_active);

COMMIT;
