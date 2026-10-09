const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MAILER_URL",
  "MAILER_SHARED_SECRET",
  "EMAIL_ACTION_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

// Preview deployments cannot reach the ID-photo bucket by design — its IAM
// binding admits only the production OIDC subject (docs/gcs-id-documents.md) —
// so requiring these there would fail every preview build for a feature that
// cannot work in it. Production and local dev still fail fast without them.
const requiredOutsidePreview = [
  "GCS_ID_DOCUMENTS_BUCKET",
  "GCS_ID_DOCUMENTS_SERVICE_ACCOUNT",
] as const;

const missing = [
  ...required,
  ...(process.env.VERCEL_ENV === "preview" ? [] : requiredOutsidePreview),
].filter((k) => !process.env[k]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}\n` +
    `Set them in client/.env.local (for local dev) or Vercel → Settings → Environment Variables (for deploys).`
  );
}
