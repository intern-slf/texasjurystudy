-- Records the requestee's attestation that they renamed the file to remove
-- any patient/identifying information before uploading. An original file name
-- can contain PHI (a HIPAA loophole), so the uploader requires this
-- attestation and we persist it on each document.
ALTER TABLE public.case_documents
  ADD COLUMN IF NOT EXISTS name_attested boolean NOT NULL DEFAULT false;

-- When the attestation was recorded (server time, set on upload). NULL for
-- documents that predate this feature.
ALTER TABLE public.case_documents
  ADD COLUMN IF NOT EXISTS name_attested_at timestamptz;
