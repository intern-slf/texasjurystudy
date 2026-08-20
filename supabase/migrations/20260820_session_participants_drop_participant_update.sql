-- =============================================================================
-- F24 / F19 — remove the participant self-UPDATE on session_participants
--
-- The policy "participants can update own invite" was row-scoped
-- (participant_id = auth.uid()) but NOT column-scoped, so a participant could
-- PATCH any column of their own invite row straight from devtools.
--
-- That was rated MED while the writable surface was session_id. The waitlist
-- work (20260820_session_waitlist.sql) put money on this table — payout_cents,
-- waitlist_outcome — so the same hole let a participant award themselves an
-- arbitrary payout, or flip waitlist_outcome to 'called_in' to claim the full
-- session rate instead of the flat waiting fee. That is HIGH.
--
-- The policy turns out to be unused. Every participant-facing write to this
-- table goes through the service role, which bypasses RLS entirely:
--
--   lib/participant/updateInviteStatus.ts   — supabaseAdmin (the whole RSVP flow)
--   app/api/email-action/route.ts           — supabaseAdmin (one-click accept/decline)
--   app/dashboard/participant/**            — supabaseAdmin (reads only)
--
-- and no client component writes to it at all. Dropping the policy therefore
-- closes the hole with no functional change: participants keep their SELECT
-- policy, so they can still read their own invite and see what they are owed.
--
-- Admin writes are unaffected — they run under "admin can manage
-- session_participants" (ALL, is_admin()).
--
-- NOTE: do NOT "fix" this with REVOKE UPDATE ... FROM authenticated instead.
-- Admins are also the `authenticated` role and reach this table through the
-- RLS-scoped client (adminRespondOnBehalf, callInWaitlistParticipant,
-- markWaitlistWaitedOut). Column grants cannot tell the two apart; RLS can.
--
-- If a direct-from-browser RSVP is ever added, it needs a NEW policy that is
-- both row- and column-scoped — never a re-add of this one.
-- =============================================================================

DROP POLICY IF EXISTS "participants can update own invite" ON public.session_participants;

-- Belt and braces: the audit (2026-05-17, F17/F22) recorded a duplicate UPDATE
-- policy on this table whose exact name was never captured. Drop anything else
-- that grants a non-admin UPDATE here, so the hole cannot survive under an alias.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_participants'
      AND cmd = 'UPDATE'
      AND COALESCE(qual, '') NOT LIKE '%is_admin%'
      AND COALESCE(with_check, '') NOT LIKE '%is_admin%'
  LOOP
    RAISE NOTICE 'Dropping non-admin UPDATE policy on session_participants: %', pol.policyname;
    EXECUTE format('DROP POLICY %I ON public.session_participants', pol.policyname);
  END LOOP;
END $$;

-- Verify: this should return only admin-guarded UPDATE policies (or none).
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'session_participants' AND cmd IN ('UPDATE', 'ALL');
