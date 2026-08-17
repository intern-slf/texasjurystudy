-- Backfill the per-session strike for participants who already had a flag_count
-- before 20260817_session_strikes.sql added struck_at.
--
-- Run this AFTER 20260817_session_strikes.sql.
--
-- This is NOT guesswork. It only touches participants whose attribution is
-- forced: they have exactly ONE invite in session_participants and exactly ONE
-- strike on the counter, so the strike can only have come from that session.
-- Anyone with multiple invites, or a count that doesn't match, is left alone and
-- reported by the audit query at the bottom.
--
-- As of 2026-08-17 that was all 5 flagged accounts (each 1/3, one invite each):
--   Helen Napolitano, Doug Merrill, Laura Freeman  -> session 2026-07-15
--   Christopher Eaddy, Jocelyn Abascal            -> session 2026-08-12

-- ---------------------------------------------------------------------------
-- STEP 1 — DRY RUN. Run this alone first and eyeball the rows.
-- ---------------------------------------------------------------------------
WITH invite_counts AS (
  SELECT participant_id, count(*) AS invite_count, min(id) AS only_invite_id
  FROM public.session_participants
  GROUP BY participant_id
)
SELECT
  jp.first_name, jp.last_name, jp.email, jp.flag_count,
  s.session_date AS will_attribute_strike_to,
  sp.invite_status
FROM invite_counts ic
JOIN public.jury_participants  jp ON jp.user_id = ic.participant_id
JOIN public.session_participants sp ON sp.id = ic.only_invite_id
LEFT JOIN public.sessions       s  ON s.id = sp.session_id
WHERE jp.flag_count = 1
  AND ic.invite_count = 1
  AND sp.struck_at IS NULL
ORDER BY s.session_date, jp.last_name;

-- ---------------------------------------------------------------------------
-- STEP 2 — APPLY. Only run once the dry run above looks right.
-- struck_at is set to the session date (the day of the no-show), not now().
-- ---------------------------------------------------------------------------
BEGIN;

WITH invite_counts AS (
  SELECT participant_id, count(*) AS invite_count, min(id) AS only_invite_id
  FROM public.session_participants
  GROUP BY participant_id
),
targets AS (
  SELECT ic.only_invite_id AS invite_id, s.session_date
  FROM invite_counts ic
  JOIN public.jury_participants   jp ON jp.user_id = ic.participant_id
  JOIN public.session_participants sp ON sp.id = ic.only_invite_id
  JOIN public.sessions            s  ON s.id = sp.session_id
  WHERE jp.flag_count = 1
    AND ic.invite_count = 1
    AND sp.struck_at IS NULL
)
UPDATE public.session_participants sp
SET struck_at = t.session_date::timestamptz
FROM targets t
WHERE sp.id = t.invite_id;

COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 3 — AUDIT. Any counter that still disagrees with the per-session strikes
-- shows up here. Expect zero rows; anything listed needs a human decision
-- (multiple invites, or a count that can't be attributed).
-- ---------------------------------------------------------------------------
SELECT
  jp.first_name, jp.last_name, jp.email,
  jp.flag_count                                        AS counter_says,
  count(sp.id) FILTER (WHERE sp.struck_at IS NOT NULL)  AS sessions_say,
  count(sp.id)                                          AS total_invites
FROM public.jury_participants jp
LEFT JOIN public.session_participants sp ON sp.participant_id = jp.user_id
WHERE jp.flag_count > 0
GROUP BY jp.user_id, jp.first_name, jp.last_name, jp.email, jp.flag_count
HAVING jp.flag_count <> count(sp.id) FILTER (WHERE sp.struck_at IS NOT NULL)
ORDER BY jp.flag_count DESC;
