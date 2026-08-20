// Texas Jury Study — mail service (Cloud Run)
//
// Sends transactional email through the Gmail API.
//
// Auth model: keyless domain-wide delegation. Cloud Run runs as a service
// account that a Workspace super-admin has authorised for the gmail.send
// scope. To act as a mailbox we need a JWT whose `sub` claim is that user
// — but we never hold a private key. Instead we ask the IAM
// Credentials API to sign the JWT on the service account's behalf
// (`:signJwt`), then exchange the signed JWT for a Gmail access token. The
// only credential in play is the ambient one from the metadata server.
//
// Deliberately zero npm dependencies: the metadata server and the Google REST
// APIs are both reachable with plain fetch, so this service has no supply
// chain and no lockfile to keep current.

import http from "node:http";
import crypto from "node:crypto";

// --- configuration ---------------------------------------------------------

const PORT = Number(process.env.PORT) || 8080;
// The mailbox we authenticate AS. Domain-wide delegation can only impersonate a
// real user, never a group or an alias -- pointing this at a group address
// fails with `unauthorized_client`, which reads misleadingly like a scope
// problem. Must be an actual Workspace user.
const IMPERSONATE_USER = mustEnv("IMPERSONATE_USER");

// The address recipients see. Defaults to the impersonated user. Gmail only
// honours a different value when that address is a verified "Send mail as"
// alias on IMPERSONATE_USER's account; otherwise Gmail silently rewrites the
// From back to the authenticated mailbox.
const FROM_ADDRESS = process.env.FROM_ADDRESS || IMPERSONATE_USER;

const SHARED_SECRET = mustEnv("MAILER_SHARED_SECRET"); // bearer the app presents
const FROM_NAME = process.env.MAIL_FROM_NAME || "Texas Jury Study";
const SEND_DOMAIN = FROM_ADDRESS.split("@")[1] || "localhost";

// Gmail allows ~250 quota units per user per second and messages.send costs
// 100, so ~2/sec is the sustainable ceiling for a single mailbox. This
// replaces nodemailer's rateDelta/rateLimit, which vanished along with the
// SMTP pool — without it a bulk campaign trips 429s instead of 454s.
const SENDS_PER_SECOND = Number(process.env.SENDS_PER_SECOND) || 2;

const MAX_BODY_BYTES = 2_000_000;

// Every outbound call needs its own deadline. undici's default header timeout
// is measured in minutes, so without these a stalled metadata server or Gmail
// backend would keep a request handler alive long after the caller has given
// up and retried — which, for a non-idempotent send, means a duplicate email.
const AUTH_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 20_000;

// Retry window for the idempotency cache. Only needs to outlive the caller's
// own retry sequence, which is a few seconds.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 5000;

const METADATA = "http://metadata.google.internal/computeMetadata/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// An error carrying an HTTP status, so the route handler can tell the caller
// whether retrying is worthwhile.
class SendError extends Error {
  constructor(message, status, retryable) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

// --- ambient credentials from the metadata server --------------------------

async function metadata(path) {
  let res;
  try {
    res = await fetch(`${METADATA}${path}`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (cause) {
    // The bare fetch error here is just "fetch failed", which is the least
    // helpful message at the exact moment you most need a hint.
    throw new SendError(
      `Cannot reach the GCP metadata server (${cause.message}). This service ` +
        `only runs on Cloud Run / GCE — there are no credentials to impersonate ` +
        `with off-platform.`,
      500,
      // Retryable: a cold-start blip and a genuinely off-platform run are
      // indistinguishable here, and retrying an auth failure is free — nothing
      // was sent, so there is no duplicate risk.
      true
    );
  }
  if (!res.ok) {
    throw new SendError(
      `Metadata server returned ${res.status} for ${path}. ` +
        `Is this running on Cloud Run with a service account attached?`,
      500,
      true // the metadata server 503s transiently during cold start
    );
  }
  return res.text();
}

// The attached service account's own address. Constant for the life of the
// instance, so resolve it once and reuse the promise.
let serviceAccountEmail;
function getServiceAccountEmail() {
  // A rejected promise is still a non-nullish value, so a bare `??=` would
  // latch a single cold-start metadata blip for the entire life of the process
  // -- every later send would replay that stale rejection and the instance
  // would never recover. Clearing the memo on failure makes it retryable.
  serviceAccountEmail ??= metadata(
    "/instance/service-accounts/default/email"
  ).catch((err) => {
    serviceAccountEmail = undefined;
    throw err;
  });
  return serviceAccountEmail;
}

async function getRuntimeToken() {
  const body = await metadata("/instance/service-accounts/default/token");
  return JSON.parse(body).access_token;
}

// --- Gmail access token via keyless impersonation --------------------------

let cachedGmailToken = null; // { token, expiresAtMs }

async function getGmailAccessToken() {
  if (cachedGmailToken && Date.now() < cachedGmailToken.expiresAtMs) {
    return cachedGmailToken.token;
  }

  const serviceAccount = await getServiceAccountEmail();
  const issuedAt = Math.floor(Date.now() / 1000);

  // `sub` is what makes this domain-wide delegation rather than a plain
  // service-account grant: it asks Google for a token acting as the user.
  // It only works if the SA's client ID is authorised for GMAIL_SEND_SCOPE in
  // the Workspace admin console.
  const claims = {
    iss: serviceAccount,
    sub: IMPERSONATE_USER,
    scope: GMAIL_SEND_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const runtimeToken = await getRuntimeToken();
  const signUrl =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(serviceAccount)}:signJwt`;

  const signRes = await fetch(signUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: JSON.stringify(claims) }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });

  if (!signRes.ok) {
    const detail = await signRes.text();
    throw new SendError(
      `signJwt failed (${signRes.status}): ${detail}. ` +
        `If this is 403, grant the runtime service account ` +
        `roles/iam.serviceAccountTokenCreator on itself.`,
      502,
      signRes.status >= 500
    );
  }

  const { signedJwt } = await signRes.json();

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    throw new SendError(
      `Token exchange failed (${tokenRes.status}): ${detail}. ` +
        `"unauthorized_client" almost always means domain-wide delegation is ` +
        `not authorised for ${GMAIL_SEND_SCOPE}, or ${IMPERSONATE_USER} is ` +
        `not a real user mailbox in this Workspace domain (a group or alias ` +
        `cannot be impersonated).`,
      502,
      tokenRes.status >= 500
    );
  }

  const token = await tokenRes.json();
  // Expire our copy two minutes early so an in-flight send never races the
  // real expiry.
  cachedGmailToken = {
    token: token.access_token,
    expiresAtMs: Date.now() + (token.expires_in - 120) * 1000,
  };
  return cachedGmailToken.token;
}

// --- rate limiting ---------------------------------------------------------

// Hands out send slots spaced 1/SENDS_PER_SECOND apart. Concurrent requests
// queue on the shared cursor rather than competing for it.
let nextSlotMs = 0;
async function takeRateLimitSlot() {
  const gap = 1000 / SENDS_PER_SECOND;
  const now = Date.now();
  const slot = Math.max(now, nextSlotMs);
  nextSlotMs = slot + gap;
  const wait = slot - now;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

// --- MIME assembly ---------------------------------------------------------

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

// RFC 2047 encoded-words. Header values must be ASCII, so any non-ASCII
// subject (our en dashes, em dashes and curly apostrophes) has to be encoded
// or it arrives mangled. Each encoded-word stays well under the 75-char limit,
// and chunking walks codepoints so a multi-byte character is never split
// across two words.
const MAX_HEADER_LINE = 78;

// RFC 5322 folding for a header that needs no encoding: break before existing
// whitespace and indent the continuation. Necessary because some subjects are
// unbounded -- `Session Scheduled: ${caseTitles.join(", ")} | Texas Jury Study`
// grows with the number of cases in the session.
function foldAscii(value, prefixLength) {
  const lines = [];
  let line = "";
  let budget = MAX_HEADER_LINE - prefixLength;

  for (const word of value.split(" ")) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= budget) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
      budget = MAX_HEADER_LINE - 1; // continuations begin with one space
    }
  }
  if (line) lines.push(line);

  return lines.join("\r\n ");
}

function encodeHeaderValue(value, prefixLength = 0) {
  if (ASCII_PRINTABLE.test(value)) {
    if (prefixLength + value.length <= MAX_HEADER_LINE) return value;

    // Folding can only break at whitespace, so a single token longer than a
    // line has to fall through to encoded-words, which may split anywhere.
    const longestToken = value
      .split(" ")
      .reduce((max, word) => Math.max(max, word.length), 0);
    if (longestToken <= MAX_HEADER_LINE - 1) {
      return foldAscii(value, prefixLength);
    }
  }

  const chunks = [];
  let current = "";
  let bytes = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 42) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) chunks.push(current);

  return chunks
    .map((c) => `=?UTF-8?B?${Buffer.from(c, "utf8").toString("base64")}?=`)
    .join("\r\n "); // folding whitespace keeps each line legal
}

// A CR or LF smuggled into an address would let a caller inject arbitrary
// headers, so addresses are validated rather than escaped.
const ADDRESS = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/;

function buildRawMessage({ to, subject, html, messageId }) {
  const headers = [
    `From: "${FROM_NAME.replace(/["\\]/g, "")}" <${FROM_ADDRESS}>`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject, "Subject: ".length)}`,
  ];

  // A deterministic Message-ID means that if a duplicate ever does escape the
  // idempotency cache, conforming clients can collapse the two copies. Without
  // one, Gmail mints a fresh ID per send and they look like separate mail.
  if (messageId) headers.push(`Message-ID: ${messageId}`);

  headers.push(
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64"
  );

  const body = Buffer.from(html, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

  // Gmail's `raw` field wants unpadded base64url.
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- sending ---------------------------------------------------------------

// Sending is not idempotent and the caller retries, so a delivery whose
// response was lost would otherwise arrive twice. Callers pass a key that stays
// stable across their own retries; the first success under a key is remembered
// and replayed rather than re-sent.
//
// This is in-process state, which is sufficient because it only has to outlive
// the caller's retry sequence (seconds) and the service is deployed with
// --max-instances 1. Raising that flag requires moving this to shared storage.
const sentByKey = new Map(); // key -> { result, atMs }

function rememberSend(key, result) {
  sentByKey.set(key, { result, atMs: Date.now() });

  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [k, entry] of sentByKey) {
    if (entry.atMs >= cutoff) break; // Map iterates in insertion order
    sentByKey.delete(k);
  }
  while (sentByKey.size > IDEMPOTENCY_MAX_ENTRIES) {
    sentByKey.delete(sentByKey.keys().next().value);
  }
}

// Gmail reports quota problems as 403 with a reason string, not only as 429.
// Treating every 403 as permanent would file a transient rate limit as a
// dropped email. dailyLimitExceeded is the exception -- it will not clear for
// hours, so retrying it is pointless.
function classifyGmailFailure(status, detail) {
  if (status === 429) return { status: 429, retryable: true };
  if (status >= 500) return { status: 502, retryable: true };
  if (status === 403) {
    if (/dailyLimitExceeded/i.test(detail)) return { status: 429, retryable: false };
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(detail)) {
      return { status: 429, retryable: true };
    }
  }
  return { status: 502, retryable: false };
}

// Keyed sends already running. A caller retry can arrive while the first
// attempt is still awaiting Gmail -- before the result was recorded -- so
// checking only completed sends would still let that retry deliver a second
// copy. Joining the in-flight promise closes that window.
const inFlightByKey = new Map(); // key -> Promise<result>

async function sendMessage(options) {
  const { idempotencyKey } = options;
  if (!idempotencyKey) return performSend(options);

  const completed = sentByKey.get(idempotencyKey);
  if (completed) return { ...completed.result, deduplicated: true };

  const running = inFlightByKey.get(idempotencyKey);
  if (running) return { ...(await running), deduplicated: true };

  const promise = performSend(options).finally(() =>
    inFlightByKey.delete(idempotencyKey)
  );
  inFlightByKey.set(idempotencyKey, promise);
  return promise;
}

async function performSend({ to, subject, html, idempotencyKey }) {
  const raw = buildRawMessage({
    to,
    subject,
    html,
    messageId: idempotencyKey ? `<${idempotencyKey}@${SEND_DOMAIN}>` : null,
  });
  await takeRateLimitSlot();

  // One retry on 401 covers the narrow window where a cached token is revoked
  // before its stated expiry. A 401 is rejected at authorization, before Gmail
  // queues anything, so this retry cannot duplicate a delivery.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getGmailAccessToken();

    let res;
    try {
      res = await fetch(GMAIL_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new SendError(
        `Gmail API request failed: ${cause.message}`,
        502,
        true
      );
    }

    if (res.ok) {
      const result = await res.json();
      if (idempotencyKey) rememberSend(idempotencyKey, result);
      return result;
    }

    if (res.status === 401 && attempt === 0) {
      cachedGmailToken = null;
      continue;
    }

    const detail = await res.text();
    const { status, retryable } = classifyGmailFailure(res.status, detail);
    throw new SendError(
      `Gmail API send failed (${res.status}): ${detail}`,
      status,
      retryable
    );
  }

  throw new SendError("Gmail API send failed after token refresh.", 502, true);
}

// --- HTTP ------------------------------------------------------------------

function authorised(req) {
  // The secret travels in its own header, not Authorization. When the service
  // is private, Cloud Run's IAM check owns Authorization and forwards the
  // caller's Google ID token to us in it — so a secret placed there would be
  // overwritten by the token and every request would 401. Authorization is
  // still accepted as a fallback for a publicly-invocable deployment.
  const dedicated = req.headers["x-mailer-secret"];
  const authHeader = req.headers.authorization || "";
  const presented =
    typeof dedicated === "string" && dedicated
      ? dedicated
      : authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(SHARED_SECRET);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Deliberately does NOT destroy the socket. Tearing it down here means
        // the 413 never reaches the caller, who sees a transport error instead
        // and retries a body that is permanently too large. Stop buffering,
        // keep draining, and let the handler answer properly.
        aborted = true;
        chunks.length = 0;
        reject(new SendError("Request body too large.", 413, false));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function respond(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return respond(res, 200, {
        ok: true,
        impersonating: IMPERSONATE_USER,
        from: FROM_ADDRESS,
      });
    }

    if (req.method !== "POST" || req.url !== "/send") {
      return respond(res, 404, { error: "Not found." });
    }

    if (!authorised(req)) {
      return respond(res, 401, { error: "Unauthorized." });
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (err) {
      if (err instanceof SendError) throw err;
      return respond(res, 400, { error: "Body must be valid JSON." });
    }

    const { to, subject, html, idempotencyKey } = payload ?? {};
    if (typeof to !== "string" || !ADDRESS.test(to)) {
      return respond(res, 400, {
        error: "`to` must be a single valid email address.",
      });
    }
    if (typeof subject !== "string" || !subject) {
      return respond(res, 400, { error: "`subject` is required." });
    }
    if (typeof html !== "string" || !html) {
      return respond(res, 400, { error: "`html` is required." });
    }
    // Goes into a Message-ID header, so it must not be able to break out of it.
    if (
      idempotencyKey !== undefined &&
      (typeof idempotencyKey !== "string" ||
        !/^[A-Za-z0-9._-]{1,128}$/.test(idempotencyKey))
    ) {
      return respond(res, 400, {
        error: "`idempotencyKey` must match [A-Za-z0-9._-]{1,128}.",
      });
    }

    const result = await sendMessage({ to, subject, html, idempotencyKey });
    console.log(
      `sent id=${result.id} to=${to}${result.deduplicated ? " (deduplicated)" : ""}`
    );
    return respond(res, 200, {
      id: result.id,
      threadId: result.threadId,
      deduplicated: Boolean(result.deduplicated),
    });
  } catch (err) {
    const status = err instanceof SendError ? err.status : 500;
    const retryable = err instanceof SendError ? err.retryable : false;
    console.error(`send failed (${status}): ${err.message}`);
    return respond(res, status, { error: err.message, retryable });
  }
});

// Guarded so a test can import the pure helpers below without binding a port.
if (process.env.MAILER_IMPORT_ONLY !== "1") {
  server.listen(PORT, () => {
    console.log(
      `tjs-mailer listening on ${PORT}, authenticating as ${IMPERSONATE_USER}, ` +
        `From: ${FROM_ADDRESS}`
    );
    if (FROM_ADDRESS !== IMPERSONATE_USER) {
      console.log(
        `NOTE: From differs from the impersonated mailbox. Gmail will rewrite it ` +
          `unless ${FROM_ADDRESS} is a verified "Send mail as" alias on ` +
          `${IMPERSONATE_USER}.`
      );
    }
  });
}

export { encodeHeaderValue, foldAscii, buildRawMessage, classifyGmailFailure };
