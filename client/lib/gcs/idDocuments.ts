// Server-only module: it holds the credentials for the ID-photo bucket and must
// never be imported from client code (`server-only` isn't a dependency, hence
// this comment instead of `import "server-only"`). Browsers get URLs exclusively
// through lib/actions/idPhotoUrls.ts — GCS has no RLS, so those actions are the
// authorization boundary the Supabase storage policies used to be.
//
// Credentials follow lib/mailerAuth.ts: the org forbids service-account keys
// (`disableServiceAccountKeyCreation`), so on Vercel the deployment's OIDC token
// is exchanged for the service account's credentials via Workload Identity
// Federation, and locally gcloud ADC impersonates the same account. Neither
// client holds a private key, so getSignedUrl signs through IAM signBlob
// (GoogleAuth.sign falls back to it): the local user needs
// roles/iam.serviceAccountTokenCreator on the service account, and the service
// account needs it on itself for the federated path.
//
// Everything is constructed lazily on first call: test files import the actions
// transitively, and a module-scope env assertion or Storage construction would
// fail the whole suite (the documented pain with lib/supabase/admin.ts).
import { Storage } from "@google-cloud/storage";
import { ExternalAccountClient, GoogleAuth, Impersonated } from "google-auth-library";
import type { AuthClient } from "google-auth-library";
import { ID_PHOTO_CONTENT_LENGTH_RANGE } from "@/lib/idPhotoLimits";

const STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";
const JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const DEFAULT_READ_URL_SECONDS = 3600;
const UPLOAD_URL_SECONDS = 600;

export type IdDocumentFile = { path: string; size: number; createdAt: string | null };

function bucketName(): string {
  const name = process.env.GCS_ID_DOCUMENTS_BUCKET;
  if (!name) {
    throw new Error("GCS_ID_DOCUMENTS_BUCKET is not set. See client/.env.example.");
  }
  return name;
}

/**
 * Reads Vercel's OIDC token. `process.env.VERCEL_OIDC_TOKEN` is request-scoped
 * and absent on deployed functions — reading only the env var was the original
 * mailer bug (see lib/mailerAuth.ts) — but `vercel env pull` does populate it
 * for local development, so it stays as the fallback.
 */
async function readVercelOidcToken(): Promise<string | null> {
  try {
    const { getVercelOidcToken } = await import("@vercel/functions/oidc");
    const token = await getVercelOidcToken();
    if (token) return token;
  } catch {
    // Not inside a Vercel request context — fall through to the env var.
  }
  return process.env.VERCEL_OIDC_TOKEN ?? null;
}

async function buildAuthClient(): Promise<AuthClient> {
  const serviceAccount = process.env.GCS_ID_DOCUMENTS_SERVICE_ACCOUNT;
  const audience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  // Only production deployments take the WIF path: the TokenCreator binding on
  // the service account admits only the environment:production subject, so a
  // dev/preview OIDC token passes STS and then 403s at generateAccessToken.
  // Everything else — local dev, `vercel dev`, a pulled VERCEL_OIDC_TOKEN in
  // .env.local, preview deploys (no bucket access by design) — uses ADC below.
  const onVercel = process.env.VERCEL_ENV === "production";

  if (onVercel) {
    if (!audience || !serviceAccount) {
      throw new Error(
        "GCP_WORKLOAD_IDENTITY_AUDIENCE and GCS_ID_DOCUMENTS_SERVICE_ACCOUNT must " +
          "be set to reach the ID-photo bucket from Vercel."
      );
    }
    // The supplier is called on every STS refresh, so the request-scoped token
    // is always read fresh, never captured at construction.
    const client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience,
      subject_token_type: JWT_TOKEN_TYPE,
      token_url: STS_TOKEN_URL,
      service_account_impersonation_url:
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        `${serviceAccount}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: async () => {
          const token = await readVercelOidcToken();
          if (!token) {
            throw new Error(
              "No Vercel OIDC token available. Check Settings -> Security -> " +
                "OIDC Federation on the Vercel project."
            );
          }
          return token;
        },
      },
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
    if (!client) {
      // fromJSON returns null only when the type isn't "external_account".
      throw new Error("ExternalAccountClient.fromJSON rejected the WIF configuration.");
    }
    return client;
  }

  // Local development: gcloud Application Default Credentials. User ADC has no
  // private key, so an Impersonated wrapper lets GoogleAuth.sign() mint V4
  // signatures via IAM signBlob as the service account.
  const sourceClient = await new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] }).getClient();
  if (!serviceAccount) return sourceClient;
  return new Impersonated({
    sourceClient,
    targetPrincipal: serviceAccount,
    targetScopes: [CLOUD_PLATFORM_SCOPE],
  });
}

let storagePromise: Promise<Storage> | null = null;

/** Memoized; a failed construction is dropped so the next call retries. */
function getStorage(): Promise<Storage> {
  if (!storagePromise) {
    storagePromise = buildAuthClient()
      .then((authClient) => new Storage({ authClient }))
      .catch((err) => {
        storagePromise = null;
        throw err;
      });
  }
  return storagePromise;
}

async function bucket() {
  return (await getStorage()).bucket(bucketName());
}

/** Every object under `<userId>/`, with bucket-relative paths like `<uuid>/<ts>-id.jpg`. */
export async function listIdPhotos(userId: string): Promise<IdDocumentFile[]> {
  const [files] = await (await bucket()).getFiles({ prefix: `${userId}/` });
  return files.map((file) => ({
    path: file.name,
    size: Number(file.metadata.size ?? 0),
    createdAt: file.metadata.timeCreated ?? null,
  }));
}

/** Deletes each object; an already-missing object is not an error. */
export async function removeIdPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const b = await bucket();
  await Promise.all(paths.map((path) => b.file(path).delete({ ignoreNotFound: true })));
}

/** V4 signed GET URL, 1 hour by default. */
export async function createReadUrl(
  path: string,
  expiresSeconds: number = DEFAULT_READ_URL_SECONDS
): Promise<string> {
  const [url] = await (await bucket()).file(path).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresSeconds * 1000,
  });
  return url;
}

/**
 * V4 signed PUT URL, 10 minutes. `contentType` and the size bound are signed,
 * so the upload must send exactly that Content-Type header plus
 * `x-goog-content-length-range: ID_PHOTO_CONTENT_LENGTH_RANGE` — without the
 * signed cap, a holder of the URL could PUT an object of any size (GCS allows
 * up to 5 TB) on the project's bill.
 */
export async function createUploadUrl(path: string, contentType: string): Promise<string> {
  const [url] = await (await bucket()).file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + UPLOAD_URL_SECONDS * 1000,
    contentType,
    extensionHeaders: { "x-goog-content-length-range": ID_PHOTO_CONTENT_LENGTH_RANGE },
  });
  return url;
}
