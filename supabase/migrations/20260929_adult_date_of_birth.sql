-- Refuse to store a date of birth that makes the person under 18.
--
-- Why: the Terms (§2) and Privacy Policy (§12) say the service is 18+, and
-- Texas jurors must be 18. Until now nothing enforced it — the confidentiality
-- agreement accepted any date, so a child entering their real birthday was
-- saved as-is. A stored DOB showing someone is under 13 is "actual knowledge"
-- under COPPA, which is what turns an 18+ promise into per-violation liability.
--
-- The app now checks at signup, on the agreement, and on profile edit
-- (client/lib/age-gate.ts), but the agreement and participant profile edits
-- write straight from the browser with the anon key, so the database is the
-- only check a modified client can't skip. Same message as the app, so the rare
-- case that reaches it still reads sensibly.
--
-- Trigger rather than CHECK: it only fires when date_of_birth is written or
-- changed, so an existing row with bad data (a typo'd import, say) doesn't make
-- every unrelated UPDATE on that participant — strikes, approvals, flags — fail.
-- Existing rows are NOT fixed by this; find them first with:
--
--   SELECT user_id, date_of_birth FROM public.confidentiality_agreements
--    WHERE date_of_birth > (current_date - interval '18 years')::date;
--   SELECT user_id, email, date_of_birth FROM public.jury_participants
--    WHERE date_of_birth > (current_date - interval '18 years')::date;
--
-- Reads nothing, so SECURITY INVOKER with an empty search_path.
--
-- Additive and safe to re-run. Run in Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_adult_date_of_birth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
     AND NEW.date_of_birth > (current_date - interval '18 years')::date
  THEN
    RAISE EXCEPTION 'Texas Jury Study is only open to people 18 and older.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS confidentiality_agreements_adult_dob ON public.confidentiality_agreements;
CREATE TRIGGER confidentiality_agreements_adult_dob
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.confidentiality_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_adult_date_of_birth();

DROP TRIGGER IF EXISTS jury_participants_adult_dob ON public.jury_participants;
CREATE TRIGGER jury_participants_adult_dob
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.jury_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_adult_date_of_birth();

COMMIT;
