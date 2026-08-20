// TEMPORARY diagnostic endpoint for the Cloud Run mailer hand-off.
//
// Exists because Next.js masks server-error messages in production builds, so a
// failing send surfaced only as "An error occurred in the Server Components
// render" with no cause. This reports what the deployed function can actually
// see, without needing access to platform logs.
//
// DELETE THIS ROUTE once mail is confirmed working. It is guarded by the shared
// secret and returns no credentials, but it is still an endpoint whose only
// purpose is introspection.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STS_URL = "https://sts.googleapis.com/v1/token";

function authorised(req: NextRequest): boolean {
  const expected = process.env.MAILER_SHARED_SECRET ?? "";
  const presented =
    req.nextUrl.searchParams.get("secret") ??
    (req.headers.get("x-mailer-secret") || "");
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Decodes a JWT payload without verifying it — for reporting iss/aud/sub only. */
function peekClaims(token: string): Record<string, unknown> | string {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "not a JWT";
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    // Only identifiers, never the whole payload.
    return {
      iss: claims.iss,
      aud: claims.aud,
      sub: claims.sub,
      exp: claims.exp,
    };
  } catch (err) {
    return `undecodable: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const report: Record<string, unknown> = {
    env: {
      // The literal value, not a boolean: a wrong host fails at DNS and never
      // reaches Cloud Run, which looks identical to an auth failure from the
      // outside. Reporting only Boolean() here hid exactly that.
      MAILER_URL: process.env.MAILER_URL ?? null,
      MAILER_URL_set: Boolean(process.env.MAILER_URL),
      MAILER_SHARED_SECRET: Boolean(process.env.MAILER_SHARED_SECRET),
      GCP_WORKLOAD_IDENTITY_AUDIENCE:
        process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE ?? null,
      MAILER_INVOKER_SERVICE_ACCOUNT:
        process.env.MAILER_INVOKER_SERVICE_ACCOUNT ?? null,
      MAILER_ID_TOKEN_set: Boolean(process.env.MAILER_ID_TOKEN),
      VERCEL_OIDC_TOKEN_in_process_env: Boolean(process.env.VERCEL_OIDC_TOKEN),
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    },
  };

  // 1. Can we obtain a Vercel OIDC token at all, and by which route?
  let oidcToken: string | null = null;
  try {
    const { getVercelOidcToken } = await import("@vercel/functions/oidc");
    oidcToken = await getVercelOidcToken();
    report.oidcSource = "getVercelOidcToken()";
  } catch (err) {
    report.oidcHelperError = err instanceof Error ? err.message : String(err);
    oidcToken = process.env.VERCEL_OIDC_TOKEN ?? null;
    if (oidcToken) report.oidcSource = "process.env";
  }

  if (!oidcToken) {
    report.oidcToken = null;
    report.verdict =
      "No Vercel OIDC token available — the token step is where sends fail.";
    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  report.oidcToken = { length: oidcToken.length, claims: peekClaims(oidcToken) };

  // 2. Does Google accept it?
  const audience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  if (!audience) {
    report.verdict = "OIDC token present but GCP_WORKLOAD_IDENTITY_AUDIENCE is unset.";
    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const res = await fetch(STS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audience,
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        scope: "https://www.googleapis.com/auth/cloud-platform",
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
        subjectToken: oidcToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (res.ok) {
      report.stsExchange = { ok: true, status: res.status };
      report.verdict = "Token exchange succeeded — federation is working.";

      // The step nothing has yet exercised: can this function actually reach
      // the mailer, and does Cloud Run's IAM check accept a *federated access
      // token* rather than an OIDC ID token? Probes /health, so no mail is
      // sent. A thrown fetch here means DNS or egress, not authorisation.
      const federated = (JSON.parse(text) as { access_token?: string })
        .access_token;
      const mailerUrl = (process.env.MAILER_URL ?? "").replace(/\/$/, "");
      if (federated && mailerUrl) {
        try {
          const probe = await fetch(`${mailerUrl}/health`, {
            headers: { Authorization: `Bearer ${federated}` },
            signal: AbortSignal.timeout(15_000),
          });
          const probeBody = await probe.text();
          report.mailerProbe = {
            url: `${mailerUrl}/health`,
            status: probe.status,
            body: probeBody.slice(0, 300),
          };
          report.verdict =
            probe.status === 200
              ? "Full chain works: token exchanged and Cloud Run accepted it."
              : `Cloud Run rejected the federated token with ${probe.status}.`;
        } catch (err) {
          report.mailerProbe = {
            url: `${mailerUrl}/health`,
            error: err instanceof Error ? err.message : String(err),
          };
          report.verdict =
            "Could not reach the mailer at all — check MAILER_URL. This is a " +
            "connectivity failure, not an authorisation one.";
        }
      }
    } else {
      report.stsExchange = { ok: false, status: res.status, body: text.slice(0, 500) };
      report.verdict = "Google rejected the token exchange; see stsExchange.body.";
    }
  } catch (err) {
    report.stsExchange = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    report.verdict = "Could not reach Google STS.";
  }

  return NextResponse.json(report, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
