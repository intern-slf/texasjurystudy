# tjs-mailer

Cloud Run service that sends Texas Jury Study transactional email through the
**Gmail API** as `support@`, replacing the old Nodemailer/Gmail-SMTP transport.

The Next.js app renders every template exactly as before (`client/lib/mail.ts`
still owns `emailWrapper` and all ~15 template functions) and POSTs the finished
HTML here. This service only delivers.

```
Vercel (Next.js)                  Cloud Run (this service)        Google
lib/mail.ts sendEmail()  ──────►  POST /send            ──────►   Gmail API
                          HTTPS   { to, subject, html }            users.messages.send
                          bearer  → RFC 2822 MIME                  as support@
                                  → base64url
```

## Why keyless

Impersonating `support@` needs a JWT whose `sub` claim is that mailbox.
Traditionally that means holding the service account's private key. Instead this
service asks the **IAM Credentials API** to sign the JWT on the service
account's behalf (`:signJwt`), then exchanges the signed JWT for a Gmail access
token. The only credential in play is the ambient one the Cloud Run metadata
server provides, so **there is no key file anywhere** — nothing to rotate, leak,
or keep out of git.

A consequence worth knowing: this service **only runs on GCP**. Off-platform
there is no metadata server, so it fails fast with a message saying so. Local
development of the *Next.js app* is unaffected — point `MAILER_URL` at the
deployed service.

## Zero dependencies

`package.json` has no `dependencies`. The metadata server and both Google REST
APIs are reachable with plain `fetch`, so there is no supply chain, no lockfile
to keep current, and no `npm install` step in the Dockerfile.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `IMPERSONATE_USER` | yes | The mailbox to **authenticate as**. Must be a real Workspace user. |
| `MAILER_SHARED_SECRET` | yes | Bearer token the Next.js app must present. Compared in constant time. |
| `FROM_ADDRESS` | no | The address recipients **see**. Defaults to `IMPERSONATE_USER`. |
| `MAIL_FROM_NAME` | no | From display name. Defaults to `Texas Jury Study`. |
| `SENDS_PER_SECOND` | no | Gmail API pacing. Defaults to `2`. |
| `PORT` | no | Set by Cloud Run. Defaults to `8080`. |

### Why the sending identity is two variables, not one

Domain-wide delegation can only impersonate a **real user**. A Google Group, or
a bare alias, cannot be a JWT `sub` — the attempt fails with
`unauthorized_client`, which reads like a scope misconfiguration and sends you
debugging entirely the wrong thing.

This was verified empirically against this project's delegation: `info@` and
`intern@` both mint tokens for `gmail.send`, while `support@` fails. So
`support@` is a group or an alias here, not a mailbox.

Hence the split. Authenticate as a real user (`IMPERSONATE_USER`), and set the
visible sender separately (`FROM_ADDRESS`). Gmail honours a differing
`FROM_ADDRESS` **only** if it is a verified "Send mail as" alias on the
impersonated account — otherwise it silently rewrites the header back to the
authenticated mailbox, and mail goes out under the wrong identity with no error.
The service logs a warning at startup whenever the two differ, so check the logs
on first deploy.

To confirm the alias exists: sign in as `IMPERSONATE_USER` → Gmail **Settings →
Accounts → "Send mail as"**. It cannot be checked via the API here, because the
delegation is scoped to `gmail.send` only and `gmail.settings.basic` is not
authorised.

## Setup

Run steps 1–5 once. Substitute your own project ID and domain.

> **On Windows, use the PowerShell commands in [Setup (PowerShell)](#setup-powershell)
> below instead.** The bash blocks in this section will not run in PowerShell:
> `export` is not a cmdlet, and a trailing `\` is not a line-continuation — a
> pasted multi-line command fails with `Missing expression after unary operator
> '--'`. Because that is a *parse* error, nothing in the block executes, so a
> failed paste leaves no half-built state behind.

### 1. Project and APIs

```bash
export PROJECT_ID=texasjurystudy
export REGION=us-central1
export SA_NAME=tjs-mailer

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  gmail.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

`iamcredentials.googleapis.com` is the one people forget — without it every
send fails at the `signJwt` step.

### 2. Service account

```bash
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Texas Jury Study mailer"

export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 3. Let it sign JWTs as itself

This is the step that makes the keyless flow work, and its absence is the most
common cause of a `403` from `signJwt`. The service account is granted the
token-creator role **on itself**:

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### 4. Authorise domain-wide delegation

Get the numeric OAuth client ID — note this is **not** the service account
email:

```bash
gcloud iam service-accounts describe "$SA_EMAIL" \
  --format='value(oauth2ClientId)'
```

Then, as a Workspace **super-admin**, in [admin.google.com](https://admin.google.com):

> Security → Access and data control → API controls → Domain-wide delegation →
> Manage Domain Wide Delegation → **Add new**

- **Client ID**: the numeric ID from above
- **OAuth scopes**: `https://www.googleapis.com/auth/gmail.send`

Grant *only* `gmail.send`. It cannot read mail, and this is the narrowest scope
that permits sending.

> Propagation is not instant. An `unauthorized_client` error in the first few
> minutes after this step usually just means it hasn't taken effect yet. Google
> documents this as potentially taking up to 24 hours, though it is normally
> minutes.

### 5. Deploy

```bash
export MAILER_SHARED_SECRET="$(openssl rand -base64 32)"
echo "Save this — it goes into Vercel too: $MAILER_SHARED_SECRET"

gcloud run deploy tjs-mailer \
  --source . \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-env-vars "SEND_AS=support@texasjurystudy.com" \
  --set-env-vars "MAILER_SHARED_SECRET=${MAILER_SHARED_SECRET}" \
  --max-instances 1 \
  --allow-unauthenticated
```

Two flags deserve explanation.

**`--max-instances 1` is load-bearing, not a cost control.** Both the Gmail
pacing (`SENDS_PER_SECOND`) and the idempotency caches are *in-process* state.
A second instance would double the effective send rate into Gmail's per-mailbox
quota, and a retry landing on a different instance would not see the first
delivery and would send a duplicate. Raise this only after moving both to
shared storage.

**`--allow-unauthenticated` does not mean unauthenticated.** Every request must
present `MAILER_SHARED_SECRET` as a bearer token; the flag only means Cloud Run
IAM isn't doing that check for us. It's needed because Vercel has no ambient way
to mint a Google ID token. To close this properly, wire Vercel's OIDC federation
to GCP Workload Identity Federation and redeploy with
`--no-allow-unauthenticated` — that keeps the whole path keyless on both ends.

### 6. Point the app at it

```bash
gcloud run services describe tjs-mailer --region "$REGION" \
  --format='value(status.url)'
```

Set both in Vercel → Settings → Environment Variables, and in
`client/.env.local` for local development:

```
MAILER_URL=https://tjs-mailer-xxxxxxxx.a.run.app
MAILER_SHARED_SECRET=<the same value from step 5>
```

## Setup (PowerShell) — Texas Jury Study specifics

Windows commands, and adapted to what already exists in this org. Every `gcloud`
invocation is on **one line**: PowerShell has no `\` continuation, and splitting
one is what produces `Missing expression after unary operator '--'`. Because
that is a *parse* error, a bad paste executes nothing and leaves no partial
state.

**Most of the hard part is already done.** Verified state of project
`sound-observer-505819-t5` ("My First Project"):

| Item | Status |
|---|---|
| Billing | enabled |
| `gmail.googleapis.com`, `iamcredentials.googleapis.com` | already enabled |
| `run`, `cloudbuild`, `artifactregistry` APIs | **need enabling** |
| Service account `group-mailer@…` ("Group Mailer (Gmail DWD)") | exists |
| Domain-wide delegation for `gmail.send` | **already authorised** — no Workspace admin step needed |
| `roles/iam.serviceAccountTokenCreator` on that SA | granted to `info@` and `intern@` (humans) — **not yet to the SA itself** |

So the remaining work is: enable three APIs, let the SA sign for itself, deploy.
No new service account, and no trip to the Workspace admin console.

```powershell
$PROJECT_ID = "sound-observer-505819-t5"
$REGION     = "us-central1"
$SA_EMAIL   = "group-mailer@sound-observer-505819-t5.iam.gserviceaccount.com"
gcloud config set project $PROJECT_ID

# 1. The three APIs still missing (one line)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 2. The SA must be able to sign JWTs as ITSELF. Today only the two human
#    accounts hold this role, which is why a local test works but Cloud Run
#    would fail with 403 from signJwt.
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountTokenCreator"
```

Then deploy:

```powershell
# Cryptographically random hex secret. Hex, not base64, so the value contains
# no ',' or '=' to confuse gcloud's --set-env-vars parsing.
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$MAILER_SHARED_SECRET = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
$MAILER_SHARED_SECRET   # save this — it also goes into Vercel

cd mailer
gcloud run deploy tjs-mailer --source . --region $REGION --service-account $SA_EMAIL --set-env-vars "IMPERSONATE_USER=info@texasjurystudy.com,FROM_ADDRESS=support@texasjurystudy.com,MAILER_SHARED_SECRET=$MAILER_SHARED_SECRET" --max-instances 1 --allow-unauthenticated

$MAILER_URL = gcloud run services describe tjs-mailer --region $REGION --format="value(status.url)"
$MAILER_URL
```

> Drop `FROM_ADDRESS=support@texasjurystudy.com` if `support@` is **not** a
> verified "Send mail as" alias on `info@`. Leaving it set when the alias does
> not exist means Gmail rewrites the From to `info@` silently — mail still sends,
> just under an identity you did not choose.

### Building this from scratch elsewhere

If you ever set this up in a fresh project, you additionally need to create a
service account and have a Workspace **super-admin** authorise its numeric
`oauth2ClientId` for `https://www.googleapis.com/auth/gmail.send` under
**Security → Access and data control → API controls → Domain-wide delegation**.
See the bash Setup section above for those steps.

Verifying, in PowerShell:

```powershell
Invoke-RestMethod "$MAILER_URL/health"

$payload = @{
  to             = "you@example.com"
  subject        = "Mailer test – en dash"
  html           = "<p>It works.</p>"
  idempotencyKey = "smoketest-001"
} | ConvertTo-Json -Compress

# UTF-8 bytes rather than -Body $payload: Windows PowerShell 5.1 would otherwise
# re-encode the string and mangle the en dash, defeating the point of the test.
Invoke-RestMethod -Method Post -Uri "$MAILER_URL/send" `
  -Headers @{ Authorization = "Bearer $MAILER_SHARED_SECRET" } `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
```

Run that **second command twice with the same `idempotencyKey`**. The first call
sends and returns `deduplicated: false`; the second must return
`deduplicated: true` and deliver nothing. That is the duplicate-send guard
working end to end — worth confirming before any bulk campaign.

## Letting Vercel call a private service (Workload Identity Federation)

This service **cannot** be made publicly invocable in this org:
`constraints/iam.allowedPolicyMemberDomains` refuses an IAM binding to
`allUsers`, and only an org-level admin can except a project from it. A
service-account key in Vercel is also out, because the org enforces
`disableServiceAccountKeyCreation`.

Workload Identity Federation solves it with neither. Verified by probe: DRS
permits `principalSet://` members — binding one failed only with *"Identity Pool
does not exist"*, not a policy violation.

### 1. Enable OIDC on the Vercel project

**Settings → Security → OIDC Federation.** Functions then receive
`VERCEL_OIDC_TOKEN` at runtime. Note the **team slug** and **project name** from
your dashboard URL (`vercel.com/<team-slug>/<project-name>`) — both are needed
below.

### 2. Create the pool and provider

**Vercel's token carries no `owner`, `project` or `environment` claims.** The
claim set is only `iss`, `aud`, `sub`, `scope`, `iat`, `nbf`, `exp`, and the
identity lives entirely inside `sub`:

```
owner:slf-interns-projects:project:texasjurystudy:environment:production
```

So the mapping must derive from `assertion.sub`. Mapping `assertion.project` (as
plenty of blog posts suggest) yields a provider that rejects every token.

Applied configuration for this org:

```powershell
$P = "sound-observer-505819-t5"

gcloud iam workload-identity-pools create "vercel-pool" --location=global --display-name="Vercel" --project=$P

gcloud iam workload-identity-pools providers create-oidc "vercel-oidc" --location=global --workload-identity-pool="vercel-pool" --project=$P --issuer-uri="https://oidc.vercel.com/slf-interns-projects" --allowed-audiences="https://vercel.com/slf-interns-projects" --attribute-mapping="google.subject=assertion.sub" --attribute-condition="assertion.sub.startsWith('owner:slf-interns-projects:project:texasjurystudy:')"
```

**The `--attribute-condition` is the security boundary, not an optimisation.**
`https://oidc.vercel.com/...` is Vercel's own infrastructure, and the provider
will validate any correctly-signed token from that issuer. Without the
condition, another Vercel account's deployment could mint a token GCP would
accept — strictly worse than the `allUsers` grant this replaces.

### 3. Grant the invoker role to the federated identity

Two layers, deliberately: the **provider** decides "is this our project", and
**IAM** decides "may it send". The binding pins the exact production subject, so
preview deployments authenticate but cannot invoke.

```powershell
$SUBJ   = "owner:slf-interns-projects:project:texasjurystudy:environment:production"
$MEMBER = "principal://iam.googleapis.com/projects/35582239679/locations/global/workloadIdentityPools/vercel-pool/subject/$SUBJ"

gcloud run services add-iam-policy-binding tjs-mailer --region us-central1 --member=$MEMBER --role=roles/run.invoker
```

Note `principal://` with `/subject/`, not `principalSet://` — only
`google.subject` is mapped, so there is no attribute to build a set from. This
binding was accepted despite domain-restricted sharing, which is exactly why
this approach works where `allUsers` does not.

Preview deployments will get `403` on send. If you want them to email too, add a
second binding with `environment:preview` in the subject — but think first about
whether preview builds should be sending mail to real participants.

### 4. Point the app at it

Add to Vercel env vars (alongside `MAILER_URL` and `MAILER_SHARED_SECRET`):

```
GCP_WORKLOAD_IDENTITY_AUDIENCE=//iam.googleapis.com/projects/35582239679/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-oidc
```

`client/lib/mailerAuth.ts` does the rest: exchanges `VERCEL_OIDC_TOKEN` at
Google's STS for a federated token, caches it for its lifetime, and sends it as
`Authorization: Bearer`. The shared secret stays in `X-Mailer-Secret` — the two
never collide.

If Cloud Run rejects the federated **access** token and insists on an OIDC **ID**
token, create a service account, give it `roles/run.invoker`, grant the
principalSet `roles/iam.workloadIdentityUser` on it, and set
`MAILER_INVOKER_SERVICE_ACCOUNT` to its email. No code change — the module
switches paths on that variable alone.

### Local development

`npm run dev` has no `VERCEL_OIDC_TOKEN`. Either use `vercel dev`, or mint a
token yourself — you already hold `run.invoker` as project Owner:

```powershell
gcloud auth print-identity-token
```

Put it in `MAILER_ID_TOKEN` in `client/.env.local`. Valid about an hour.

## Verifying

Health check needs no auth:

```bash
curl "$MAILER_URL/health"
# {"ok":true,"sendAs":"support@texasjurystudy.com"}
```

A real send, including a non-ASCII subject to confirm RFC 2047 encoding
survives the trip:

```bash
curl -X POST "$MAILER_URL/send" \
  -H "Authorization: Bearer $MAILER_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@example.com","subject":"Mailer test – en dash","html":"<p>It works.</p>"}'
# {"id":"1936...","threadId":"1936..."}
```

Check the delivered message shows the en dash correctly and comes `From`
`Texas Jury Study <support@...>`. Then confirm it also lands in `support@`'s
Gmail **Sent** folder — Gmail API sends do, which is a genuine improvement over
SMTP relay for auditing what the system sent.

## API

`GET /health` → `200 {"ok":true,"sendAs":"..."}`

`POST /send`, bearer auth required:

```json
{
  "to": "one@recipient.com",
  "subject": "...",
  "html": "<p>...</p>",
  "idempotencyKey": "optional-but-strongly-advised"
}
```

| Status | Meaning |
|---|---|
| `200` | Sent. Body is `{ id, threadId, deduplicated }`. |
| `400` | Malformed body, `to` is not a single valid address, or a bad `idempotencyKey`. |
| `401` | Missing or wrong bearer token. |
| `413` | Body over 2 MB. |
| `429` | Gmail rate or quota limit. `retryable` distinguishes a transient limit from the daily cap. |
| `502` | Auth or Gmail upstream failure. `retryable` says whether to retry. |

Error bodies carry `{ error, retryable }`. The client in `client/lib/mail.ts`
honours `retryable`, retrying up to 3 times with exponential backoff.

### Idempotency

A Gmail send cannot be undone, and a lost response is indistinguishable from a
failed one — so a naive retry means the recipient gets the email twice. Any
caller that retries **must** send a stable `idempotencyKey`
(`[A-Za-z0-9._-]{1,128}`), identical across every attempt at the same logical
send. `client/lib/mail.ts` generates one `randomUUID()` per `sendEmail()` call
and reuses it for all three attempts.

The service guards two distinct windows:

- **Completed sends** are remembered for 10 minutes and replayed, so a retry
  after the response was lost returns the original result with
  `deduplicated: true` instead of delivering again.
- **In-flight sends** are joined, not restarted. This is the window that matters
  most: a caller whose 30-second timeout fires while the mailer is still waiting
  on Gmail would otherwise retry *before* the first send had been recorded.

The key also becomes a deterministic `Message-ID`, so if a duplicate ever does
escape both guards, conforming mail clients can collapse the copies.

Both caches are in-process. That is sufficient because they only need to outlive
a caller's retry sequence (seconds) — but it is another reason
`--max-instances 1` matters, and moving to shared storage is a prerequisite for
raising it.

## Known limitations

**The daily cap is unchanged.** Gmail allows roughly 2,000 messages per day for
a Workspace mailbox. This migration removes the SMTP login throttling problem,
not the daily ceiling. A campaign materially larger than the current
500-recipient cap still needs a transactional ESP.

**Large fan-outs can still exceed Vercel's function timeout.** At the default
2 sends/second, `sendReactivationEmails`'s 500-recipient cap takes ~250 seconds
of wall clock, and that loop runs inside a Vercel server action. Moving the
send *transport* here does not move the *fan-out*. The fix is to have the server
action enqueue one Cloud Task per recipient pointing at this service — that
gives managed retries, no timeout ceiling, and per-recipient isolation. Note
that Cloud Tasks retries at-least-once, so each task would need an idempotency
key checked before sending, or a retry becomes a duplicate email.

## Rollback

Nothing here is stateful. To return to Nodemailer/SMTP, revert the commit that
introduced this directory and restore the `SMTP_*` variables in Vercel; the
Cloud Run service can be left running or deleted with
`gcloud run services delete tjs-mailer --region "$REGION"`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403` from `signJwt` | Step 3 missing — the SA lacks `serviceAccountTokenCreator` on itself. |
| `unauthorized_client` on token exchange | Delegation not authorised, not yet propagated, the scope doesn't match exactly — **or `IMPERSONATE_USER` is a group/alias rather than a real user**, which is the same error and the easiest to misdiagnose. |
| Mail arrives from the wrong address | `FROM_ADDRESS` is not a verified "Send mail as" alias on `IMPERSONATE_USER`, so Gmail rewrote it. Check the startup log warning. |
| `Cannot reach the GCP metadata server` | Running off-platform, or no service account attached to the revision. |
| `400 Precondition check failed` from Gmail | `SEND_AS` isn't a real mailbox in the delegated domain. |
| `401` from this service | `MAILER_SHARED_SECRET` differs between Vercel and Cloud Run. |
| Mangled subject lines | Should not happen — report it, `encodeHeaderValue` handles RFC 2047. |
