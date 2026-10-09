# ID documents on Google Cloud Storage

**Project:** Texas Jury Study — GCP project `sound-observer-505819-t5`
**Bucket:** `gs://texasjurystudy-id-documents` (us-south1)
**Status (2026-10-07):** bucket built, configured, and backfilled; **the IAM grants in section 2 are still pending** — the app cannot read or write GCS until an operator runs them.

---

## 1. What moved and why

Participant driver's-licence photos — the Supabase Storage bucket `id-documents` — now live
in Google Cloud Storage. Supabase drops from Pro to the **Free plan after October 2026**,
which caps storage at **1 GB**, and the full-size ID photos are most of what the project
stores. Moving them to GCS (same project that already runs the mailer) takes ID storage out
of that cap entirely.

Everything below was already configured on **2026-10-07** — do not redo it:

- Bucket `gs://texasjurystudy-id-documents`, region `us-south1`, **private**: uniform
  bucket-level access on, public-access prevention enforced. There are no object ACLs and
  no way to make a file public by accident; every read goes through a signed URL.
- **CORS** allows `PUT` (for browser uploads via signed URLs) from exactly three origins:
  `http://localhost:3000`, `https://www.texasjurystudy.com`,
  `https://texasjurystudy.vercel.app`, with `Content-Type` and
  `x-goog-content-length-range` as allowed request headers (both are signed into upload
  URLs, so the browser preflight must pass them). The live policy is committed verbatim at
  `docs/gcs-id-documents-cors.json`; a new domain means editing that file and re-applying
  it (section 5).
- All **310 files** were copied from Supabase with their bucket-relative paths unchanged:
  `<user-uuid>/<timestamp>-id.<ext>`. Nothing in the database changed —
  `jury_participants.driver_license_image_url` stores that same relative path.
- Service account **`id-documents-app@sound-observer-505819-t5.iam.gserviceaccount.com`**
  exists. It is the identity the app acts as for every bucket operation and every signed
  URL. It currently holds **no roles** — that is section 2.

**How the app authenticates.** The same way the mailer does (see `mailer/README.md`,
"Letting Vercel call a private service"): no service-account JSON key — the org enforces
`disableServiceAccountKeyCreation`, so a key is not merely discouraged, it cannot be
created. On Vercel, the function's `VERCEL_OIDC_TOKEN` is exchanged through **the existing
Workload Identity Federation pool and provider, `vercel-pool` / `vercel-oidc`** — they were
created for the mailer and are deliberately reused here rather than inventing a second
pool; the provider's attribute condition already admits exactly this Vercel project and
nothing else. The federated identity then impersonates the service account above.

The OIDC exchange is used **only by production deployments** — the code gates on
`VERCEL_ENV === "production"`, matching the IAM binding below, which admits only the
production subject. Everything else (plain `npm run dev`, `vercel dev`, a
`VERCEL_OIDC_TOKEN` left in `.env.local` by `vercel env pull`, and preview deployments —
which have no bucket access by design) starts from Application Default
Credentials (`gcloud auth application-default login` as `intern@texasjurystudy.com`): the
two scripts (`client/scripts/cleanup-id-photos.mjs`,
`client/scripts/sync-id-documents-to-gcs.mjs`) call GCS as you directly, while the app
(`client/lib/gcs/idDocuments.ts`) uses your ADC to impersonate the service account when
`GCS_ID_DOCUMENTS_SERVICE_ACCOUNT` is set — which it must be for URL signing, since user
credentials hold no key to sign with.

## 2. One-time IAM setup — still required

The automation that built the bucket, the CORS config and the file copy **was not
permitted to grant IAM**, so an operator (a project Owner) must run these once, in
PowerShell. Until then uploads, reads and signed URLs all fail — section 5 shows how each
missing grant looks.

```powershell
$P  = "sound-observer-505819-t5"
$SA = "id-documents-app@sound-observer-505819-t5.iam.gserviceaccount.com"

# 1. The SA owns the objects: list, read, write and delete — in this bucket only,
#    nothing project-wide.
gcloud storage buckets add-iam-policy-binding gs://texasjurystudy-id-documents --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"

# 2. Let the Vercel production deployment impersonate the SA. The member is the exact
#    identity the mailer binding already pins (mailer/README.md step 3): principal:// with
#    the full subject — not principalSet://, because the provider maps only
#    google.subject, so there is no attribute to build a set from.
$MEMBER = "principal://iam.googleapis.com/projects/35582239679/locations/global/workloadIdentityPools/vercel-pool/subject/owner:slf-interns-projects:project:texasjurystudy:environment:production"
gcloud iam service-accounts add-iam-policy-binding $SA --member=$MEMBER --role="roles/iam.serviceAccountTokenCreator" --project=$P

# 3. The SA must sign its own URLs: getSignedUrl calls signBlob via the IAM Credentials
#    API when there is no private key (there never is here — keys are forbidden), and
#    that needs TokenCreator on itself. Same pattern as the mailer SA signing its own JWTs.
gcloud iam service-accounts add-iam-policy-binding $SA --member="serviceAccount:$SA" --role="roles/iam.serviceAccountTokenCreator" --project=$P
```

Notes:

- Step 2 grants `serviceAccountTokenCreator` rather than the narrower
  `workloadIdentityUser` the mailer README mentions as a fallback: it includes the
  `getAccessToken` permission the impersonation exchange needs, and one role keeps the
  binding list short. Either would let the exchange through.
- Like the mailer's invoker binding, step 2 pins the **production** subject. Preview
  deployments authenticate at the provider but cannot touch the bucket — which is right,
  since the bucket holds real IDs. If a preview ever genuinely needs it, that is a second
  binding with `environment:preview` in the subject, and a decision to make deliberately.

**Local development** needs two more grants, because the scripts and `npm run dev` run as
your user, not as the Vercel identity:

```powershell
# Scripts (cleanup, sync) call GCS directly as you — they need the bucket role.
gcloud storage buckets add-iam-policy-binding gs://texasjurystudy-id-documents --member="user:intern@texasjurystudy.com" --role="roles/storage.objectAdmin"

# npm run dev signs URLs by impersonating the SA (user credentials cannot sign) — set
# GCS_ID_DOCUMENTS_SERVICE_ACCOUNT in .env.local (section 3) and grant yourself:
gcloud iam service-accounts add-iam-policy-binding $SA --member="user:intern@texasjurystudy.com" --role="roles/iam.serviceAccountTokenCreator" --project=$P
```

Then authenticate once: `gcloud auth application-default login` as
`intern@texasjurystudy.com`. No key file is ever downloaded or configured.

## 3. Environment variables

| Variable | Where | Value |
|---|---|---|
| `GCS_ID_DOCUMENTS_BUCKET` | Vercel **Production** + `client/.env.local` | `texasjurystudy-id-documents`. **The app requires it** (`client/lib/gcs/idDocuments.ts` throws when it's unset); the two scripts fall back to this value on their own. |
| `GCS_ID_DOCUMENTS_SERVICE_ACCOUNT` | Vercel **Production** + `client/.env.local` | `id-documents-app@sound-observer-505819-t5.iam.gserviceaccount.com` — the SA the app impersonates. Required in production; required locally for URL signing (without it the app falls back to raw user credentials, which cannot sign). |
| `GCP_WORKLOAD_IDENTITY_AUDIENCE` | Vercel only | `//iam.googleapis.com/projects/35582239679/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-oidc` — **already set for the mailer**; the same value serves both, so there is nothing to add unless it was removed. Not used locally (ADC instead). |

The Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) stay:
the database, auth and the other buckets are still Supabase. The scripts also still read
them from `.env.local` for their `jury_participants` / `oldData` queries.

## 4. Cutover runbook

In order; each step assumes the previous one finished.

1. **IAM:** run the section 2 grants (once).
2. **Env vars:** set the two `GCS_*` section 3 variables in Vercel's **Production**
   environment, and in `client/.env.local`. `client/lib/env.ts` requires them at build
   time (via `next.config.ts`) everywhere **except Preview**: a production build without
   them fails fast — and Vercel keeps serving the previous deployment — while preview
   builds skip the check, because previews cannot reach the bucket anyway (the section 2
   binding pins the production subject). Setting them in Preview or Development too is
   harmless but unnecessary; either variable type (Secret or Config) works.
3. **Deploy** the app change (branch `feat/id-documents-gcs`) to production.
   `@google-cloud/storage@8` requires Node ≥ 22; `client/package.json` pins
   `engines.node` to `22.x`, which takes precedence over the project's Node.js setting
   (confirmed in the 2026-10-08 build logs: "the Node.js Version defined in your Project
   Settings ("24.x") will not apply"). From this moment every new upload goes to GCS and
   nothing writes to the Supabase bucket again.
4. **Catch up the gap.** Uploads that landed in Supabase between the 2026-10-07 bulk copy
   and the deploy are not in GCS yet. From `client/`:

   ```powershell
   node scripts/sync-id-documents-to-gcs.mjs           # dry run — review the list
   node scripts/sync-id-documents-to-gcs.mjs --apply   # copy; must end "0 failed", exit 0
   ```

   The script copies a Supabase file only when it is missing in GCS (or differs in size)
   **and a `jury_participants` profile currently links it** — unlinked files are skipped
   and counted, because after cutover the app deletes GCS objects deliberately (replaced
   photos, underage account deletions) while the frozen Supabase bucket still holds those
   bytes; copying everything would resurrect them. It never deletes anything and is safe
   to re-run; a dry run that reports only skipped-unlinked files and nothing to copy is
   the done state.
5. **Verify in the live app:**
   - sign up a test participant and upload an ID photo (exercises the CORS `PUT` and the
     write path);
   - open the admin **new participants** tab and confirm the photo renders (signed read
     URLs work);
   - replace a photo on an existing participant and confirm the new one shows (write +
     read + the post-save cleanup path).
6. **The Supabase `id-documents` bucket stays, frozen,** as a fallback copy. Nothing
   writes to it, nothing prunes it — `scripts/cleanup-id-photos.mjs` now targets GCS only,
   so the Supabase copy cannot shrink or drift. Deleting it (to actually free the Supabase
   storage) is a **separate, explicit decision** once GCS has run clean for a while; it is
   not part of this cutover.

## 5. Troubleshooting

| Symptom | Cause |
|---|---|
| `Permission 'iam.serviceAccounts.signBlob' denied` (or any `signBlob` error) when a photo URL is generated | Section 2 step 3 missing — the SA lacks `serviceAccountTokenCreator` **on itself**. Locally: your user lacks it on the SA, or `GCS_ID_DOCUMENTS_SERVICE_ACCOUNT` is unset so there is no SA to sign as. |
| Browser console: CORS error on `PUT` to `storage.googleapis.com`; the upload never starts | The page's origin is not in the bucket's CORS list (only `localhost:3000`, `www.texasjurystudy.com` and `texasjurystudy.vercel.app` are allowed), or a required request header was dropped from the policy. The live policy is committed at `docs/gcs-id-documents-cors.json` — edit **that file** (keep `Content-Type` and `x-goog-content-length-range` in `responseHeader`; both are signed into upload URLs) and re-apply with `gcloud storage buckets update gs://texasjurystudy-id-documents --cors-file=docs/gcs-id-documents-cors.json`. `--cors-file` **replaces the whole policy**, so never feed it a hand-reconstructed fragment; to double-check what is live first: `gcloud storage buckets describe gs://texasjurystudy-id-documents --format="json(cors_config)"`. |
| `403` opening a photo's signed read URL | The SA lacks `roles/storage.objectAdmin` on the bucket (section 2 step 1) — the URL signs fine but GCS refuses the underlying read. If the grants are in place, check whether the URL simply expired. |
| `403`/`401` from GCS on Vercel only, while local dev works | Section 2 step 2 missing (the Vercel identity cannot impersonate the SA), or `GCP_WORKLOAD_IDENTITY_AUDIENCE` was removed. Remember the binding pins **production** — preview deployments are refused by design. |
| Scripts fail locally with `Could not load the default credentials` | No ADC on this machine — run `gcloud auth application-default login` as `intern@texasjurystudy.com`. Service-account key files are not an alternative; the org forbids creating them. |
