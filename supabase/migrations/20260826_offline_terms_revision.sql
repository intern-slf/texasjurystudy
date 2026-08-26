-- =============================================================================
-- OFFLINE TERMS REVISION
--
-- Corrects the figures recorded by 20260825_offline_cases.sql. That migration is
-- left untouched because it has already been applied; this one carries the new
-- numbers forward for databases that already ran it.
--
-- What changed, and why there is no schema change here:
--
--   requestee, in person   $10,000/hr  ->  $1,500/hr
--   participant, in person $100/hr     ->  $40/hr
--   in-person waitlist     did not exist -> exists, on its own terms:
--                            $30.00 flat if they hold and are not called in
--                            30-minute hold window (online stays 15)
--                            arrive 15 minutes early for check-in
--
-- All four live in application code (client/lib/receipt-pricing.ts and
-- client/lib/participant/waitlist.ts), not in the database. The only thing the
-- database asserted about them was the column comment below, which is now wrong,
-- so that is all this migration fixes.
--
-- The no-mixing rule and the scheduled-case format lock are unaffected: both
-- triggers from 20260825 still stand exactly as written.
-- =============================================================================

COMMENT ON COLUMN public.cases.delivery_mode IS
  'online | offline. online = Zoom focus group ($850/hr to the requestee, $30/hr to participants, 15-minute waitlist hold at $10). offline = in-person focus group ($1,500/hr and $40/hr, 30-minute on-site waitlist hold at $30, arrive 15 minutes early). Every case in a session must share one value — enforced by session_cases_single_delivery_mode.';
