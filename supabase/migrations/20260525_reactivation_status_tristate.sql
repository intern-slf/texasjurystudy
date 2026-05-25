-- Replace the is_active boolean with a tri-state reactivation_status column
-- so the Active column can show Pending / Yes / No instead of just Yes / No.
-- Run in Supabase SQL Editor.

BEGIN;

-- 1. New tri-state status column, default 'pending'
ALTER TABLE public.jury_participants
  ADD COLUMN IF NOT EXISTS reactivation_status text NOT NULL DEFAULT 'pending';

-- 2. Carry forward any prior is_active=true rows so we don't lose responses
--    already collected during testing. Guarded so the migration is re-runnable
--    after is_active has already been dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'jury_participants'
      AND column_name  = 'is_active'
  ) THEN
    UPDATE public.jury_participants
      SET reactivation_status = 'yes'
      WHERE is_active = true AND reactivation_status = 'pending';
  END IF;
END$$;

-- 3. Constrain to known values
ALTER TABLE public.jury_participants
  DROP CONSTRAINT IF EXISTS jury_participants_reactivation_status_check;

ALTER TABLE public.jury_participants
  ADD CONSTRAINT jury_participants_reactivation_status_check
  CHECK (reactivation_status IN ('pending', 'yes', 'no'));

-- 4. Drop the old boolean + its index — replaced by reactivation_status
DROP INDEX IF EXISTS public.jury_participants_is_active_idx;

ALTER TABLE public.jury_participants
  DROP COLUMN IF EXISTS is_active;

-- 5. Index on the status field for fast filtering
CREATE INDEX IF NOT EXISTS jury_participants_reactivation_status_idx
  ON public.jury_participants (reactivation_status);

COMMIT;
