# Test Suite Reference

**Project:** Texas Jury Study
**Scope:** [client/__tests__/](../client/__tests__/) (Vitest) + [.github/workflows/ci.yml](../.github/workflows/ci.yml) (GitHub Actions)
**Last reviewed:** 2026-05-27

This document is the canonical reference for every automated check that runs against this repository. It tells new contributors **what each test guards, why it exists, how to run it locally, and what to do when it fails**. Pair it with [schema.md](./schema.md) and [rls-policies.md](./rls-policies.md) when changing data-layer code.

---

## 1. Test stack at a glance

| Layer | Tool | Where |
|---|---|---|
| Unit + integration tests | **Vitest 4.x** | [client/__tests__/](../client/__tests__/) |
| Static analysis | **ESLint 9** + **`tsc --noEmit`** | `npm run lint`, `npx tsc --noEmit` |
| Build verification | **Next.js 15 production build** | `npm run build` |
| Secret scanning | **Gitleaks** | CI only |
| CI runner | **GitHub Actions** (Ubuntu, Node 20) | [.github/workflows/ci.yml](../.github/workflows/ci.yml) |

All tests live under [client/__tests__/](../client/__tests__/). The convention is one `<topic>.test.ts` per **product area**, with each file containing a top-level `describe` and nested `describe` blocks for each sub-feature. There is **no React / DOM rendering** in this suite — every test exercises pure functions, server actions, or API route handlers with mocked Supabase / mail / Next.js boundaries.

### Running tests locally

```bash
cd client
npm ci                                  # one-time install
npm test                                # run the entire suite once (vitest run)
npm run test:watch                      # watch mode (vitest)
npx vitest run __tests__/<file>.test.ts # run a single file
npx vitest run -t "<test name fragment>" # run by test name
```

The suite has **one required environment variable** for the tokenized-email tests: `EMAIL_ACTION_SECRET`. CI sets it to `test-secret-for-ci-only`; locally any non-empty string works. Every other secret (Supabase URL / keys, app URL) is defaulted inside the test files themselves via `process.env.X ||= "..."`, so a fresh checkout passes without a `.env` file. Mail config needs no default at all: the suite mocks `@/lib/mail` wholesale, so no test ever reaches the transport.

---

## 2. CI workflow — [.github/workflows/ci.yml](../.github/workflows/ci.yml)

CI runs on every **pull request targeting `main`** and on every **push to `main`**. There are **16 parallel jobs**; a PR cannot merge unless they all succeed.

| Job | Purpose | Command |
|---|---|---|
| `lint` | ESLint over the entire `client/` package. Catches dead imports, unused vars, React-rules violations, accessibility lint. | `npm run lint` |
| `typecheck` | TypeScript strict-mode check with no emit. Catches every type error at the contract boundary (server actions, Supabase row types, props). | `npx tsc --noEmit` |
| `build` | Full Next.js production build with placeholder env vars. Catches build-time regressions — missing exports, server/client boundary mistakes, route collisions. | `npm run build` |
| `test-helpers` | Runs the whole Vitest suite. The 11 sibling `test-*` jobs below are deliberate duplicates that report a **per-area pass/fail signal** in the PR check list, so a reviewer can see at a glance which area broke. | `npm test` |
| `test-education-hierarchy` | Per-area shard: education hierarchy logic. | `npx vitest run __tests__/education-hierarchy.test.ts` |
| `test-email-action-token` | Per-area shard: signed-token round-trip + expiration. | `npx vitest run __tests__/emailActionToken.test.ts` |
| `test-filter-utils` | Per-area shard: case filter translation, combination, relaxation. | `npx vitest run __tests__/filter-utils.test.ts` |
| `test-timezone` | Per-area shard: local→UTC conversion. | `npx vitest run __tests__/timezone.test.ts` |
| `test-api-route-handlers` | Per-area shard: `/api/*` route handlers. | `npx vitest run __tests__/api-route-handlers.test.ts` |
| `test-authentication` | Per-area shard: signup, password reset, middleware, confidentiality gate. | `npx vitest run __tests__/authentication.test.ts` |
| `test-cases` | Per-area shard: case CRUD, approve/reject, archive/restore. | `npx vitest run __tests__/cases.test.ts` |
| `test-sessions` | Per-area shard: session creation, invites, status updates. | `npx vitest run __tests__/sessions.test.ts` |
| `test-rls` | Per-area shard: RLS policy intent (TypeScript simulator). | `npx vitest run __tests__/rls.test.ts` |
| `test-documents-drive-links` | Per-area shard: case document upload/delete + drive links. | `npx vitest run __tests__/documents-drive-links.test.ts` |
| `test-participants` | Per-area shard: participant profile actions (currently scaffolded). | `npx vitest run __tests__/participants.test.ts` |
| `secrets` | Gitleaks scan of the **full git history** (`fetch-depth: 0`) for leaked credentials. Failure means a secret pattern matched — rotate the secret first, then sanitize history. | `gitleaks/gitleaks-action@v2` |

**Important:** the per-area shards exist for **reporting clarity** in PR checks; they re-run code that `test-helpers` already covers. When you add a new test file, add a matching shard job so its failure surfaces by name on the PR — see the existing entries as templates.

---

## 3. Test files

The sections below document every file in [client/__tests__/](../client/__tests__/), in the order they appear in CI.

### 3.1 [education-hierarchy.test.ts](../client/__tests__/education-hierarchy.test.ts) — pure helper

**Subject:** `applyEducationAutoSelect()` and the `EDUCATION_LEVELS` ordered list from [lib/education-hierarchy](../client/lib/education-hierarchy.ts).
**Why this exists:** the case-filter UI lets a requestee pick an education level; selecting a lower level must auto-select every level above it (a juror with a graduate degree also satisfies a "some college" requirement). Hierarchy bugs silently change a case's audience — they are visible only as a drop in matching participants.

| Test | Guarantee |
|---|---|
| Lowest level adds every level | Picking *Less than High School* expands to the full list. |
| Highest level adds only that level | Picking *Graduate Degree* does **not** retroactively check lower levels. |
| Middle level adds itself + every level above | Picking *Some College* yields `[Some College, Bachelor Degree, Graduate Degree]`. |
| Deselecting removes the level and every level above | Hierarchy invariant holds on deselect, not just select. |
| Deselecting the lowest level clears everything | Idempotent reset. |
| Deduplicates when ancestors already present | No duplicate strings in the persisted JSON. |
| Unknown option returns input unchanged | Safe against future enum changes. |
| `EDUCATION_LEVELS[0] < ... < last` | Tripwire — reordering the canonical list breaks every test downstream that relies on it. |

### 3.2 [emailActionToken.test.ts](../client/__tests__/emailActionToken.test.ts) — security primitive

**Subject:** `generateEmailActionToken()` and `verifyEmailActionToken()` from [lib/emailActionToken](../client/lib/emailActionToken.ts) — the HMAC-signed token used in accept/decline links sent to participants.
**Why this exists:** these tokens are the *only* authentication on the one-click email-action endpoint. A weakness here means a third party can accept or decline an invitation on someone else's behalf.

| Test | Guarantee |
|---|---|
| Round-trip `accepted` / `declined` | Issuance and verification agree on the payload. |
| Different-secret rejection | Tokens issued under a rotated secret are rejected — supports key rotation. |
| Signature tamper rejection | Flipping a signature byte invalidates the token. |
| Payload tamper rejection | Changing the payload without re-signing invalidates the token. |
| Malformed / empty input | Returns `null` instead of throwing — the route handler relies on this. |
| Expires after 7 days | Uses `vi.useFakeTimers` to assert exactly the 7-day window. |
| Still valid at 6 days | Anchors the lower bound of the window. |
| `inviteId` not forgeable | Token A's `inviteId` is never returned when verifying Token B. |

### 3.3 [filter-utils.test.ts](../client/__tests__/filter-utils.test.ts) — query translation

**Subject:** `applyCaseFilters`, `combineCaseFilters`, `relaxFilters` from [lib/filter-utils](../client/lib/filter-utils.ts).
**Why this exists:** these helpers translate the JSON filter blob stored on a case into a chain of Supabase `.in()` / `.eq()` / `.gte()` / `.lte()` calls. A mistranslation either over-includes (privacy leak across cases) or under-includes (empty match set). The tests use a `MockQueryBuilder` that records every chained call rather than hitting a database.

| `describe` | Guarantees covered |
|---|---|
| `applyCaseFilters` | Age range → DOB gte/lte; gender / state / education / race / political affiliation as `IN`; eligibility scalars as `EQ`; `"Any"` eligibility values are dropped; availability mapped to boolean columns; empty filter object emits no clauses. |
| `combineCaseFilters` | Conflicting Yes/No on an eligibility field becomes `undefined`; agreeing values are preserved; state arrays unioned; per-case age ranges collected into `ageRanges`. |
| `relaxFilters` | Priority-ordered drop: level 0 keeps everything → level N drops the N lowest-priority filters → beyond the priority list, everything is dropped. Critical for the "expand audience" UX. |

### 3.4 [timezone.test.ts](../client/__tests__/timezone.test.ts) — pure helper

**Subject:** `localToUTC()` and `localToUTCTime()` from [lib/timezone](../client/lib/timezone.ts).
**Why this exists:** sessions are scheduled in the admin's local timezone but persisted as UTC. Wrong conversion sends emails with wrong times and surfaces in calendar links. The tests pin DST, non-whole-hour offsets, and the ambiguous spring-forward / fall-back windows.

| Test | Guarantee |
|---|---|
| UTC pass-through | Identity for `tz == UTC`. |
| `America/New_York` standard time | +5h offset in January. |
| `America/New_York` DST | +4h offset in July. |
| `Asia/Kolkata` (+5:30) | Non-whole-hour offsets handled. |
| Spring-forward window (`2025-03-09 02:30`) | Does not throw; returns a valid ISO. |
| Fall-back window (`2025-11-02 01:30`) | Does not throw; returns a valid ISO. |
| Invalid IANA zone | Throws — fails fast rather than silently returning the wrong instant. |
| `localToUTCTime` returns the `HH:MM:SS` substring | Matches the DB `time` column format. |

### 3.5 [api-route-handlers.test.ts](../client/__tests__/api-route-handlers.test.ts) — HTTP boundary

**Subject:** the four route handlers under [app/api/](../client/app/api/) and [app/auth/confirm/route.ts](../client/app/auth/confirm/route.ts).
**Why this exists:** these handlers are the only HTTP surface area in the app — every other interaction goes through server actions. They must validate input, surface upstream errors as HTTP status codes, and never leak internal state.

| `describe` | Coverage |
|---|---|
| `zip-lookup.test.ts` | Hits the **real** zippopotam.us + geo.fcc.gov endpoints. Asserts: 200 with a `state` for `78701`; 400 for non-numeric ZIP; 404 for `00000` (upstream-failure surfacing); graceful degradation to `county: ""` when the FCC endpoint throws. **Note:** this test reaches the internet — it can be flaky in restricted networks. Total budget: 15 s per case. |
| `convert-heic.test.ts` | The `heic-convert` library is mocked to behave like a real decoder (validates the `ftyp` magic, rejects > 10 MiB). Asserts a HEIC file converts to JPEG (SOI marker `0xFFD8`), a PNG is rejected, an 11 MiB payload returns 500 with a `too large` error. |
| `email-action.test.ts` | The one-click accept/decline endpoint. Generates a real signed token, drives `updateInviteStatus` via a spy, and asserts the **rendered HTML** contains the user-visible headline for each branch: success, already-responded, session-full, session-already-started, missing-profile (driver license + PayPal), expired token, tampered signature. The started branch also asserts it does **not** fall through to the session-full page, which is the catch-all for an unrecognised block reason. |
| `auth-confirm.test.ts` | Supabase `verifyOtp` is mocked. A valid `token_hash` redirects to `/dashboard`; an expired token redirects to `/auth/error?error=...`; a missing token redirects to `/auth/error?error=Invalid or missing token`. The redirect target is asserted by catching the `RedirectError` thrown by the mocked `next/navigation`. |

### 3.6 [authentication.test.ts](../client/__tests__/authentication.test.ts) — auth server actions + middleware

**Subject:** [app/auth/actions.ts](../client/app/auth/actions.ts) (`signupWithCustomEmail`, `resetPasswordWithCustomEmail`), the `setSession` / `updateUser` surface that backs the update-password form, and [lib/supabase/proxy.ts](../client/lib/supabase/proxy.ts)'s `updateSession` middleware.

| `describe` | Coverage |
|---|---|
| `signup-with-custom-email.test.ts` | Participant signup writes a `roles` row with `role: "participant"` and sends a verification email containing the action link; same for `requestee`; duplicate-email flow returns `{ error: "User already registered" }` and **does not** insert a role row or send an email; missing `role` parameter trips the NOT-NULL constraint and the verification email is suppressed. |
| `reset-password-with-custom-email.test.ts` | Known email sends a "Password Reset" subject line to the right recipient with the verification link in the body; **unknown email does not leak** — no email is sent, and the email address is not echoed in the response (defends against user-enumeration via differential output). |
| `update-password.test.ts` | Mocks the browser Supabase client. Valid recovery session calls `setSession` once and `updateUser` with the new password; expired session surfaces an `expired|missing` error; **mismatched confirm-password short-circuits before any Supabase call** (the submit guard, not the server, is the safety net). |
| `middleware.test.ts` | Unauthenticated request to `/dashboard` returns a 307 to `/auth/login`; authenticated request passes through (200, no `Location`); both `requestee` and `participant` are allowed through to `/dashboard` so the page's own role-router can run (regression guard — the middleware must not itself bounce them). |
| `confidentiality-gate.test.ts` | Mirrors the query path used by [app/dashboard/page.tsx](../client/app/dashboard/page.tsx): picks the right agreement table per role and decides allowed-vs-blocked. Asserts `requestee` is blocked with no row and both roles are allowed with `agreed: true`. |

### 3.7 [cases.test.ts](../client/__tests__/cases.test.ts) — case lifecycle

**Subject:** the case CRUD path, the real `approveCaseAction` / `rejectCaseAction` from [lib/actions/adminCase](../client/lib/actions/adminCase.ts), the real `updateCaseFilters` from [app/dashboard/requestee/actions/updateCaseFilters](../client/app/dashboard/requestee/actions/updateCaseFilters.ts), and the inline archive / restore / schedule actions that live in the requestee dashboard page.

The Supabase server client is a stateful mock: a queue of responses (`state.responses`) is shifted off in order as the action chains `.select() → .update() → .eq() → ...`. `state.captured` records every table call so tests can assert filter columns and payloads precisely.

| `describe` | Coverage |
|---|---|
| `create-case.test.ts` | Happy path inserts `title`, `user_id`, `filters` into `cases`; empty/whitespace title throws *before* any DB call; non-requestee role rejected with "requestee role required"; files > 50 MiB rejected with "exceeds the 50 MiB limit". |
| `approve-case.test.ts` | Updates `admin_status: "approved"` filtered by `id`; calls `sendApprovalEmail(to, title)` exactly once; non-admin caller is blocked by the simulated RLS (`42501`) and the email is **not** sent. |
| `reject-case.test.ts` | Updates `admin_status: "rejected"` and stores `rejection_reason`; calls `sendRejectionEmail(to, title, reason)`; non-admin caller blocked by RLS and email suppressed. |
| `archive-case.test.ts` | Requestee archive: sets `status: "previous"`, `deleted_at: <iso>`, scoped by both `id` AND `user_id` (defense in depth); admin archive: same payload but **no `user_id` filter** (admin overrides ownership); requestee attempt against another user's case still emits the `user_id = self` filter — they cannot reach the row. |
| `restore-case.test.ts` | Admin restore flips `status → "current"`, `deleted_at → null`; requestee attempt against a foreign case is blocked by RLS while still emitting the `user_id` scope filter. |
| `update-case-filters.test.ts` | The persisted filter JSON round-trips unchanged; the education-hierarchy auto-fill is preserved end-to-end (covers the `filter-utils` ↔ `education-hierarchy` integration through the persist layer); both `id` and `user_id` filters applied to the UPDATE. |
| `confirm-schedule.test.ts` | Requestee accepts → `schedule_status: "accepted"` plus a `scheduled_at` copied from `admin_scheduled_at`; admin reschedule flips `schedule_status` back to `"pending"` and stores the new `admin_scheduled_at` so the requestee must re-confirm. |
| `propose-schedule.test.ts` | Admin proposing a schedule sets `admin_scheduled_at` and resets `schedule_status` to `"pending"` (mirrors the inline action in `app/dashboard/Admin/page.tsx:57`). |

### 3.8 [sessions.test.ts](../client/__tests__/sessions.test.ts) — sessions + invitations

**Subject:** the real `createSession`, `addCasesToSession`, `inviteParticipants` from [lib/actions/session](../client/lib/actions/session.ts), and `updateInviteStatus` from [lib/participant/updateInviteStatus](../client/lib/participant/updateInviteStatus.ts).

Both Supabase clients (`server` and `admin`) share the same stateful mock so a single test can drive a flow that crosses client boundaries. The mail layer exposes spies for every named export it references — if you add a new mail function and forget to add it to the factory, the test will fail at import time, which is the intended tripwire.

| `describe` | Coverage |
|---|---|
| `create-session.test.ts` | Admin caller: inserts into `sessions` with `created_by = admin.id` and `session_date` from the input; non-admin caller blocked at the RLS boundary (`42501`). |
| `add-cases-to-session.test.ts` | Inserts one `session_cases` row per case (length asserted); start_time / end_time are passed through `localToUTCTime` for the given session date and timezone — guards the integration between this action and the timezone helper; each linked case's `admin_scheduled_at` is set to a valid UTC instant on the session date, targeted by case id. |
| `invite-participants.test.ts` | One `session_participants` row per invitee, all with `invite_status: "pending"` and the right `session_id`; the action does **not** enforce `participant_cap` itself — the test mirrors the caller contract by trimming before invoking, documenting where the cap must be enforced; sends exactly one email per invitee to the resolved address. |
| `update-invite-status.test.ts` | `pending → accepted` records `responded_at` and a status flip; `pending → declined` skips the pre-checks; **session-started block** returns `{ blocked: true, reason: "session_started" }` — checked *first*, so no capacity or profile query is even issued; **session-full block** returns `{ blocked: true, reason: "session_full" }` only once the seats **and** the waitlist are gone, and never issues the update; **missing-profile block** returns `{ blocked: true, reason: "missing_profile", missing: [...] }` listing the unsatisfied fields (`dl`, `paypal`); declining after the session has started still succeeds and touches neither `sessions` nor `session_cases`; the **double-response gate** lives in the route handler — its contract (skip the action entirely if `invite_status` is already terminal) is asserted here at the layer boundary. <br><br>**Waitlist:** accepting once the seats are gone writes `invite_status: "waitlisted"` with `waitlist_position` 1 then 2 and the flat waiting fee as `payout_cents` — never a refusal and never the seat rate; a normal seat records `payout_cents` = hourly rate × session length with a null `waitlist_position`. <br><br>Every accept-path case must enqueue `notStartedYet()` (2 responses) then `occupancy()` (3 responses) after the invite row — both gates run before the rest, so omitting them shifts the whole FIFO queue. |

### 3.9 [rls.test.ts](../client/__tests__/rls.test.ts) — RLS policy intent (simulator)

**Subject:** **a TypeScript simulator of the RLS policies**, not real PostgreSQL. The simulator encodes the access rules so they can be reviewed in code review alongside the SQL migrations under [supabase/migrations/](../supabase/migrations/) and the description in [docs/rls-policies.md](./rls-policies.md).

> **Regression gap, in writing:** if a SQL migration changes a policy without updating the simulator, these tests will still pass. The simulator is a **specification check**, not an integration check. Closing this gap requires a Dockerized Supabase running in CI — that work is intentionally out of scope for this file.

| `describe` | Policy guaranteed |
|---|---|
| `rls-roles.test.ts` | `roles` table is immutable from the client. Any non-`service_role` UPDATE returns `42501`. Specifically asserts a requestee cannot self-promote to admin by writing their own `roles` row. |
| `rls-cases.test.ts` | `admin` reads all cases; `requestee` reads only cases where `user_id = auth.uid()`; `participant` reads none. |
| `rls-case-documents.test.ts` | Visibility flows through case ownership — same partitioning as `cases`. A document attached to a foreign case is never visible. |
| `rls-session-participants.test.ts` | A `participant` sees only invites where `participant_id = auth.uid()`. |
| `rls-jury-participants.test.ts` | `participant` sees their own full row (PII included). `admin` sees every row including PII. `requestee` sees **every** row but **only** the demographic projection (`gender`, `race`, `county`, `age_bracket`, `education_level`, `political_affiliation`). The test exhaustively asserts that no PII column (`first_name`, `last_name`, `email`, `phone`, `street_address`, `paypal_username`, `driver_license_number`) appears on a requestee-projected row. This is the load-bearing privacy invariant of the product. |
| `rls-storage-objects.test.ts` | **Storage-bucket RLS (F23, 2026-06-09).** Simulates the `storage.objects` policy set: owner-scoped self-service (a participant reads/overwrites/deletes only their own `id-documents` license; a requestee only their own `case-documents`), with cross-user reads/deletes denied (`42501`) — the closed leak. `admin` reads all in both buckets and may overwrite an existing `id-documents` object (the admin license-replace path, policy #4) but is **not** granted UPDATE on `case-documents`. INSERT is owner-scoped (caller becomes owner). `service_role` bypasses RLS (the video upload script). |

### 3.10 [documents-drive-links.test.ts](../client/__tests__/documents-drive-links.test.ts) — case attachments

**Subject:** the real `uploadCaseDocument` / `deleteCaseDocument` from [app/dashboard/requestee/actions/caseDocuments](../client/app/dashboard/requestee/actions/caseDocuments.ts) and `addDriveLink` / `deleteDriveLink` from [app/dashboard/requestee/actions/caseDriveLinks](../client/app/dashboard/requestee/actions/caseDriveLinks.ts).

The Supabase mock here is extended with a **storage** facade so `storage.from(bucket).upload / remove` are captured alongside table operations.

| `describe` | Coverage |
|---|---|
| `upload-case-document.test.ts` | Uploads land in the `case-documents` bucket at `{caseId}/{uuid}.{ext}`; a `case_documents` row is inserted with `case_id`, `uploaded_by = user.id`, `original_name`, `mime_type`, `storage_path`, `file_size`; an unauthenticated call throws *before* touching storage or DB. |
| `delete-case-document.test.ts` | Removes the storage object **and** deletes the DB row; the delete is scoped by both `id` and `uploaded_by = user.id` (owner-only guard — the regression vector is dropping the `uploaded_by` filter and letting a requestee delete someone else's document). |
| `add-drive-link.test.ts` | Valid `http(s)://` URL is persisted with `case_id` and `uploaded_by`; invalid URL string is rejected before any DB call (the production action delegates URL validation to the form, and the test wrapper mirrors that contract here so the guarantee is captured at this layer). |
| `remove-drive-link.test.ts` | Owner can delete (scoped by `id` and `uploaded_by`); non-owner attempt is blocked by RLS (`42501`) — the `uploaded_by` filter is still asserted as defense-in-depth. |

### 3.11 [participants.test.ts](../client/__tests__/participants.test.ts) — **scaffolded placeholders**

This file is intentionally `it.todo` placeholders for participant-profile actions. **It runs in CI and passes** (todo tests are reported but not failing), but it does **not** guard real behavior yet. Each todo names a test case that should be written when the underlying server action / RLS policy stabilizes:

- `create-profile.test.ts` — Happy path, missing required demographic, duplicate profile prevention.
- `update-profile-self.test.ts` — User can update only own profile.
- `update-profile-admin.test.ts` — Admin can update any profile; non-admin blocked.

**Action item for further development:** replace each `it.todo(...)` with a real `it(name, async () => { ... })` once the corresponding server action exists in [client/lib/](../client/lib/). The mocking pattern from [cases.test.ts](../client/__tests__/cases.test.ts) — the `state.responses` queue + `state.captured` log — is the model to copy.

### 3.12 [match-participant-to-filter.test.ts](../client/__tests__/match-participant-to-filter.test.ts) — **scaffolded placeholders**

Same shape as 3.11: four `it.todo` entries that document the contract of a `matchParticipantToFilter(participant, filters)` predicate that **does not yet exist** in `client/lib/`. The todos are:

- Successful match
- Mismatch case
- Multi-value AND logic
- Optional filters ignored

**Action item:** when the matcher is implemented, this file should be the first one written — it is the inverse of [filter-utils.test.ts](../client/__tests__/filter-utils.test.ts) (filters translated into a DB query) and they should agree on every fixture.

### 3.13 [case-lineage.test.ts](../client/__tests__/case-lineage.test.ts) — who is "spent" on a follow-up chain

**Subject:** the real `getLineageParticipantInvolvement`, `getLineageParticipantIds`, `splitLineageInvolvement` and `isLineageBlocking` from [lib/case-lineage](../client/lib/case-lineage.ts). This is the rule behind the "Already used" tag on every invite screen, so it is asserted directly rather than through a page.

Uses a **table-keyed** fake client rather than the FIFO response queue of 4.1: the involvement walk fires `sessions` and `session_participants` concurrently, so a queue would silently encode `Promise.all` ordering.

| `describe` | Coverage |
|---|---|
| `case-lineage involvement classification` | Only two states spend a participant: `accepted`, and an unanswered invite to a session that has not happened (`pending-upcoming`, which stops one person accepting two sessions in the same chain). Accepted-then-**struck** classifies as `struck` and does **not** block — they backed out or never showed, so they never sat on the case. `declined` (and the legacy `rejected` spelling) and a past unanswered invite (`no-response`) do not block either. A **waitlisted** row does not block even on an upcoming session — the reserve slot is not participation, and a call-in flips the row to `accepted`, which blocks on its own. A session dated **today** counts as upcoming. When someone appears on several cases in one chain the blocking classification wins. A case with no sessions yields an empty map. |
| `splitLineageInvolvement` | Partitions an involvement map into blocked ids and the non-blocking history the UI shows as "Previously invited — …" next to a still-selectable name; asserts nobody lands in both halves, and that the split agrees with `isLineageBlocking`. |

### 3.14 [roster-order.test.ts](../client/__tests__/roster-order.test.ts) — participant list order

**Subject:** the real `rosterGroup` / `rosterStatusLabel` / `sortRoster` / `compareRosterEntries` from [lib/participant/rosterOrder](../client/lib/participant/rosterOrder.ts) — pure, no mocks.

**Why this exists:** five screens render the same roster from five different row shapes ([Admin/sessions](../client/app/dashboard/Admin/sessions/page.tsx), [ParticipantRoster](../client/components/ParticipantRoster.tsx), [CaseParticipantSummary](../client/components/CaseParticipantSummary.tsx), [PreviousParticipantsModal](../client/components/PreviousParticipantsModal.tsx), [RequesteeParticipantHistory](../client/components/RequesteeParticipantHistory.tsx)). They agree only because they share this comparator, so it is asserted here rather than five times over.

| `describe` | Coverage |
|---|---|
| `rosterGroup` | Buckets `accepted` / `declined` / `pending`; the legacy `rejected` spelling reads as declined; `null`, `undefined` and unknown statuses read as pending (matching `InviteStatusBadge`); a strike **outranks** whatever status it was applied to, so an accepted-then-struck participant is never grouped with the people who are coming. |
| `rosterStatusLabel` | One label per group, including `Struck` for a struck accept. |
| `sortRoster` | Order is accepted → declined → pending → struck, matching the declared `ROSTER_GROUP_ORDER`; alphabetical **inside** a group only (an accepted "Zoe" still outranks a declined "Adam"); the within-group key is the displayed `"First Last"` string; the input array is not mutated; equal entries compare `0` so the sort stays stable; an empty roster is handled. |

### 3.15 [session-start.test.ts](../client/__tests__/session-start.test.ts) — session timing: the accept cutoff and the cooldown

**Subject:** the real `sessionStartInstant` / `hasSessionStarted` / `sessionEndInstant` / `cooldownAfterSession` from [lib/participant/sessionStart](../client/lib/participant/sessionStart.ts) — pure, with `now` injected so nothing is clock-flaky.

**Why this exists:** these are the rules behind "you can no longer accept this invitation" and "you are on cooldown until the day after your session". `session_cases.start_time` / `end_time` are stored **UTC** (`addCasesToSession` runs the admin's local input through `localToUTCTime`), so session date + a case time is a real instant rather than a floating wall-clock time.

> **These assertions only bite on a non-UTC host.** Every instant is built with an explicit `Z`; drop it and the values still match on a UTC machine (Vercel) while drifting by the offset everywhere else. The dev machine here is UTC+5:30, which is how the cooldown bug was caught — do not "simplify" these to local-time parsing.

| `describe` | Coverage |
|---|---|
| `sessionStartInstant` | Anchors to the **earliest** case start across the session, not the first row returned; accepts `HH:MM` as well as `HH:MM:SS`; tolerates a full timestamp in the date column; falls back to midnight UTC when a session has no case times (it cannot be run without cases, so the day itself closes it); returns `null` for a missing or unparseable date; skips unparseable times rather than throwing. |
| `hasSessionStarted` | False one second before the first case, true exactly at the start instant, and stays true during and long after the session; **false earlier the same day** — the gate is the case start, not midnight; an unreadable date does not block, on the principle that a response should get through rather than be rejected on a row we cannot parse. |
| `sessionEndInstant` | Takes the latest case end, rolling an end that falls *before* the session start onto the next day (a 19:30→22:30 plus 22:30→00:30 session ends at 00:30 the following morning, not 22:30). Falls back to the start instant when no end times exist; null on an unreadable date. |
| `cooldownAfterSession` | The day after the session ends, in UTC. **Regression:** the cooldown used to be built as `new Date(\`${date}T${endTime}\`)` with no `Z`, so it parsed in the *server's* local zone and was correct only by luck on a UTC host — on this repo's dev machine (UTC+5:30) it landed 5.5 hours early. Also asserts month-end (Aug 31 → Sep 1) and year-end (Dec 31 → Jan 1) rollover, which the old `Date.setDate()` approach computed in local time; null times leave the cooldown untouched rather than writing a wrong one. |

### 3.16 [waitlist.test.ts](../client/__tests__/waitlist.test.ts) — reserve slots and payouts

**Subject:** the real `assignSlot` / `sessionLengthHours` / `seatPayoutCents` / `waitlistPayoutCents` / `formatCents` / `isWaitlisted` from [lib/participant/waitlist](../client/lib/participant/waitlist.ts) — pure.

**Why this exists:** once a session's seats are gone the next people to accept take waitlist slots, hold in the Zoom waiting room, and are paid one of two amounts. That arithmetic decides real money, so it is asserted directly rather than through the accept path.

| `describe` | Coverage |
|---|---|
| `assignSlot` | Seats fill first, the waitlist opens **exactly at** the cap, and an accept is refused only once both are gone. Includes the past-the-cap case: calling a waitlister in deliberately pushes accepted to 11/10, which must not wrap around into offering seats again. A `waitlist_cap` of 0 restores the old refuse-at-cap behaviour. |
| `sessionLengthHours` | Spans the earliest start to the latest end across every case; handles a single case, a half-hour session, and one running past midnight. **Regression:** a 19:30→22:30 plus 22:30→00:30 session measured 3 hours instead of 5, because `max()` picked 22:30 over 00:30 and the midnight wrap was never detected — each end is now rolled past midnight *before* the maximum is taken. Missing or unparseable times yield 0. |
| `payouts` | A seat earns the hourly rate × session length, rounded to whole cents; a **called-in** waitlister earns the FULL session, not the remainder from when they were admitted; a **waited-out** waitlister earns the flat fee regardless of how long the session ran. `formatCents` renders a missing amount as an em dash rather than `$0.00`, so an unrecorded payout never reads as "owed nothing". |
| `isWaitlisted` | Matches only the `waitlisted` status — never `accepted`, `pending`, or null. |

---

## 4. Mocking patterns used across the suite

These are the four reusable patterns. New tests should pick one and reuse the shape rather than inventing a new mock layout.

### 4.1 Stateful Supabase mock with a response queue

Used in [cases.test.ts](../client/__tests__/cases.test.ts), [sessions.test.ts](../client/__tests__/sessions.test.ts), [documents-drive-links.test.ts](../client/__tests__/documents-drive-links.test.ts), and partially in [api-route-handlers.test.ts](../client/__tests__/api-route-handlers.test.ts).

```ts
const state = {
  user: null,                 // mocked auth.getUser() return
  responses: [],              // FIFO queue, one entry per terminal await
  captured: [],               // every (table, ops[], eqs[]) recorded
  rlsBlock: false,            // when true, next mutation returns 42501
};
```

- `state.responses` is shifted off in the order the action awaits — count your `.single()` / awaited chains carefully.
- `state.captured` is the assertion surface: find the right table call, find the right op (`select` / `update` / `insert` / `delete`), assert on its payload and on the `eqs` array.
- The chain builder implements `then` so `await supabase.from(...).update(...).eq(...)` works without an explicit terminal — this matches production code.

### 4.2 Spy-based mail mock

Every test file that touches mail mocks `@/lib/mail` and replaces the named exports with `vi.fn()` spies. The factory must export **every** name that the production file imports (otherwise the import fails at module load). When you add a new `send*` function in [lib/mail](../client/lib/mail.ts), update every test file's mock factory.

### 4.3 `next/cache` revalidate stub

All server-action tests stub `next/cache` so `revalidatePath` is a no-op:

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

### 4.4 `next/navigation` redirect interceptor

Route-handler tests need to assert the redirect target. The `redirect()` function from `next/navigation` throws internally in production; the tests mock it to throw a `RedirectError` whose `url` is the redirect target, then assert with `.rejects.toMatchObject({ url: "..." })`.

---

## 5. Adding new tests — checklist for further development

When you add a new feature, follow this checklist:

1. **Pick the right file.** Match the product area (`cases`, `sessions`, `documents-drive-links`, etc.). If your feature is genuinely new, create `<area>.test.ts` in [client/__tests__/](../client/__tests__/) and **add a matching per-area shard job** in [.github/workflows/ci.yml](../.github/workflows/ci.yml) so its failure is visible by name on the PR.
2. **Reuse a mocking pattern from §4.** Do not reinvent the Supabase mock.
3. **Test the contract, not the implementation.** Assert what the database call did (payload, filters) and what side-effects happened (emails sent, statuses changed). Avoid asserting on private intermediate variables.
4. **Cover the RLS edge.** For any mutation, write at least one test where the RLS layer blocks it (`state.rlsBlock = true`) and assert no side-effects fire.
5. **If you change an RLS policy in [supabase/migrations/](../supabase/migrations/), update [rls.test.ts](../client/__tests__/rls.test.ts) to match.** The simulator is the only review surface — the SQL alone is not.
6. **Keep tests independent.** `beforeEach` must reset the module-level `state` object completely. A leaked response from one test breaks the next one in a confusing way.
7. **Run `npm test` locally before pushing.** CI fails fast, but the per-area shards make a green local run cheap.

---

## 6. Known limitations

- **No real PostgreSQL.** RLS is asserted only against a TypeScript simulator. A SQL-only policy regression will not be caught.
- **No React rendering.** UI behavior (toast messages, button disabled states, optimistic updates) is not covered. The closest proxy is the rendered HTML assertion in `email-action.test.ts`.
- **`zip-lookup.test.ts` calls the public internet.** It will fail in offline / firewalled environments. There is a 15-second per-test timeout; if the upstream becomes unreliable, mock `global.fetch` (the existing "County lookup failure" test shows the pattern).
- **`participants.test.ts` and `match-participant-to-filter.test.ts` are placeholders.** They contribute zero regression coverage today and exist only as a contract for future work.
- **Secret scanning runs against full history (`fetch-depth: 0`).** A new gitleaks rule will flag historical leaks; you cannot ignore them by only sanitizing `HEAD`.
