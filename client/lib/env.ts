const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MAILER_URL",
  "MAILER_SHARED_SECRET",
  "EMAIL_ACTION_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "GCS_ID_DOCUMENTS_BUCKET",
  "GCS_ID_DOCUMENTS_SERVICE_ACCOUNT",
] as const;

const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}\n` +
    `Set them in client/.env.local (for local dev) or Vercel → Settings → Environment Variables (for deploys).`
  );
}
