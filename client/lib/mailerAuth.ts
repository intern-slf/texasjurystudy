// Obtains a Google-signed token authorising a call to the private Cloud Run
// mailer, without any service-account key.
//
// Why this exists: the mailer cannot be made publicly invocable. This
// organisation enforces `constraints/iam.allowedPolicyMemberDomains`
// (domain-restricted sharing), which refuses an IAM binding to `allUsers`. It
// also enforces `disableServiceAccountKeyCreation`, so shipping a key to Vercel
// was never an option either. Workload Identity Federation is what remains, and
// it is the better answer anyway: nothing is publicly reachable and there is no
// long-lived credential to rotate.
//
// The chain:
//   1. Vercel signs a short-lived OIDC token for this deployment and exposes it
//      as VERCEL_OIDC_TOKEN (requires OIDC Federation enabled on the project).
//   2. Google's STS exchanges that for a federated access token, having checked
//      it against the workload identity pool provider.
//   3. Optionally, that token mints an ID token for the Cloud Run audience by
//      impersonating a service account.
//
// Step 3 is conditional because Cloud Run accepts both OAuth access tokens and
// OIDC ID tokens for its IAM check. The access token from step 2 is usually
// enough; MAILER_INVOKER_SERVICE_ACCOUNT switches on the ID-token path without
// a code change if it turns out not to be.

const STS_URL = "https://sts.googleapis.com/v1/token";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const JWT_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:jwt";

const EXCHANGE_TIMEOUT_MS = 10_000;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/**
 * Reads Vercel's OIDC token.
 *
 * `process.env.VERCEL_OIDC_TOKEN` is NOT a reliable source in production: the
 * token is request-scoped and refreshed per invocation, so on a deployed
 * function the variable is simply absent. Reading it was the original bug —
 * every send threw before reaching the mailer, and Next.js masked the message
 * in production builds so it surfaced only as a generic render error.
 *
 * The env var is still worth checking as a fallback, because `vercel env pull`
 * does populate it for local development.
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

let cached: CachedToken | null = null;

function cacheFor(token: string, lifetimeSeconds: number): string {
  // Expire our copy a minute early so an in-flight send never races the real
  // expiry.
  const margin = 60_000;
  const lifetime = Math.max(lifetimeSeconds * 1000 - margin, 30_000);
  cached = { token, expiresAtMs: Date.now() + lifetime };
  return token;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function exchangeOidcToken(
  oidcToken: string,
  audience: string
): Promise<{ token: string; lifetimeSeconds: number }> {
  const result = (await postJson(STS_URL, {
    audience,
    grantType: TOKEN_EXCHANGE_GRANT,
    requestedTokenType: ACCESS_TOKEN_TYPE,
    scope: CLOUD_PLATFORM_SCOPE,
    subjectTokenType: JWT_TOKEN_TYPE,
    subjectToken: oidcToken,
  })) as { access_token?: string; expires_in?: number };

  if (!result.access_token) {
    throw new Error("STS token exchange returned no access_token.");
  }
  return {
    token: result.access_token,
    lifetimeSeconds: result.expires_in ?? 3600,
  };
}

async function mintIdToken(
  federatedToken: string,
  serviceAccount: string,
  audience: string
): Promise<string> {
  const url =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(serviceAccount)}:generateIdToken`;

  const result = (await postJson(
    url,
    { audience, includeEmail: true },
    { Authorization: `Bearer ${federatedToken}` }
  )) as { token?: string };

  if (!result.token) {
    throw new Error("generateIdToken returned no token.");
  }
  return result.token;
}

/**
 * Returns a bearer token for the mailer, or null when federation is not
 * configured — in which case the caller is presumably talking to a publicly
 * invocable service and only needs the shared secret.
 */
export async function getMailerAuthToken(): Promise<string | null> {
  // Local development: `vercel dev` supplies VERCEL_OIDC_TOKEN, but a plain
  // `npm run dev` does not. Paste the output of
  //   gcloud auth print-identity-token
  // into MAILER_ID_TOKEN to work against the deployed mailer for an hour.
  const override = process.env.MAILER_ID_TOKEN;
  if (override) return override;

  const audience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  if (!audience) return null;

  const oidcToken = await readVercelOidcToken();
  if (!oidcToken) {
    throw new Error(
      "GCP_WORKLOAD_IDENTITY_AUDIENCE is set but no Vercel OIDC token is " +
        "available. Check Settings -> Security -> OIDC Federation on the " +
        "Vercel project, or set MAILER_ID_TOKEN for local development."
    );
  }

  if (cached && Date.now() < cached.expiresAtMs) return cached.token;

  const { token: federated, lifetimeSeconds } = await exchangeOidcToken(
    oidcToken,
    audience
  );

  const invokerServiceAccount = process.env.MAILER_INVOKER_SERVICE_ACCOUNT;
  if (!invokerServiceAccount) {
    return cacheFor(federated, lifetimeSeconds);
  }

  const mailerUrl = process.env.MAILER_URL;
  if (!mailerUrl) {
    throw new Error(
      "MAILER_INVOKER_SERVICE_ACCOUNT is set but MAILER_URL is missing; " +
        "the ID token needs the Cloud Run URL as its audience."
    );
  }

  const idToken = await mintIdToken(
    federated,
    invokerServiceAccount,
    mailerUrl.replace(/\/$/, "")
  );
  // ID tokens from generateIdToken are valid for an hour.
  return cacheFor(idToken, 3600);
}

/** Test seam: drops the cached token so the next call re-exchanges. */
export function resetMailerAuthCache(): void {
  cached = null;
}
