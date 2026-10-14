# Test Suite Reference

**Project:** Texas Jury Study
**Scope:** [client/__tests__/](../client/__tests__/) (Vitest) + [.github/workflows/ci.yml](../.github/workflows/ci.yml) (GitHub Actions)
**Last reviewed:** 2026-10-07

This document is the canonical reference for every automated check that runs against this repository. It tells new contributors **what each test guards, why it exists, how to run it locally, and what to do when it fails**. Pair it with [schema.md](./schema.md) and [rls-policies.md](./rls-policies.md) when changing data-layer code. For a flat list of every test name mapped to the function it exercises, see [test-inventory.md](./test-inventory.md).

---

## 1. Test stack at a glance

| Layer | Tool | Where |
|---|---|---|
| Unit + integration tests | **Vitest 4.x** | [client/__tests__/](../client/__tests__/) |
| Static analysis | **ESLint 9** + **`tsc --noEmit`** | `npm run lint`, `npx tsc --noEmit` |
| Build verification | **Next.js 15 production build** | `npm run build` |
| Secret scanning | **Gitleaks** | CI only |
| CI runner | **GitHub Actions** (Ubuntu, Node 22 — `@google-cloud/storage@8` requires ≥22) | [.github/workflows/ci.yml](../.github/workflows/ci.yml) |

All tests live under [client/__tests__/](../client/__tests__/). The convention is one `<topic>.test.ts` per **product area**, with each file containing a top-level `describe` and nested `describe` blocks for each sub-feature. There is **no DOM rendering** in this suite; the one place React renders is [§3.27](#327-case-booking-viewstestts--the-booking-boxes-when-a-read-fails), which turns two async server components into static HTML. Every other test exercises pure functions, server actions, or API route handlers with mocked Supabase / GCS / mail / Next.js boundaries.

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

CI runs on every **pull request targeting `main`** and on every **push to `main`**. There are **20 parallel jobs**; a PR cannot merge unless they all succeed.

| Job | Purpose | Command |
|---|---|---|
| `lint` | ESLint over the entire `client/` package. Catches dead imports, unused vars, React-rules violations, accessibility lint. | `npm run lint` |
| `typecheck` | TypeScript strict-mode check with no emit. Catches every type error at the contract boundary (server actions, Supabase row types, props). | `npx tsc --noEmit` |
| `build` | Full Next.js production build with placeholder env vars. Catches build-time regressions — missing exports, server/client boundary mistakes, route collisions. | `npm run build` |
| `test-helpers` | Runs the whole Vitest suite. The 15 sibling `test-*` jobs below are deliberate duplicates that report a **per-area pass/fail signal** in the PR check list, so a reviewer can see at a glance which area broke. | `npm test` |
| `test-education-hierarchy` | Per-area shard: education hierarchy logic. | `npx vitest run __tests__/education-hierarchy.test.ts` |
| `test-email-action-token` | Per-area shard: signed-token round-trip + expiration. | `npx vitest run __tests__/emailActionToken.test.ts` |
| `test-filter-utils` | Per-area shard: case filter translation, combination, relaxation. | `npx vitest run __tests__/filter-utils.test.ts` |
| `test-timezone` | Per-area shard: local→UTC conversion. | `npx vitest run __tests__/timezone.test.ts` |
| `test-api-route-handlers` | Per-area shard: `/api/*` route handlers. | `npx vitest run __tests__/api-route-handlers.test.ts` |
| `test-authentication` | Per-area shard: signup, password reset, middleware, confidentiality gate. | `npx vitest run __tests__/authentication.test.ts` |
| `test-cases` | Per-area shard: case CRUD, approve/reject, archive/restore. | `npx vitest run __tests__/cases.test.ts` |
| `test-sessions` | Per-area shard: session creation, invites, status updates. | `npx vitest run __tests__/sessions.test.ts` |
| `test-delivery-mode` | Per-area shard: online vs in-person — pricing, payout, waitlist terms, no-mixing rule. | `npx vitest run __tests__/delivery-mode.test.ts` |
| `test-rls` | Per-area shard: RLS policy intent (TypeScript simulator). | `npx vitest run __tests__/rls.test.ts` |
| `test-documents-drive-links` | Per-area shard: case document upload/delete + drive links. | `npx vitest run __tests__/documents-drive-links.test.ts` |
| `test-participants` | Per-area shard: participant profile actions (currently scaffolded). | `npx vitest run __tests__/participants.test.ts` |
| `test-id-photos` | Per-area shard: replaced-ID-photo cleanup against the GCS `id-documents` seam. | `npx vitest run __tests__/id-photos.test.ts` |
| `test-underage-account` | Per-area shard: under-18 account deletion — storage first, rows, then the login. | `npx vitest run __tests__/underage-account.test.ts` |
| `test-id-photo-urls` | Per-area shard: the signed-URL server actions guarding GCS `id-documents`. | `npx vitest run __tests__/id-photo-urls.test.ts` |
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

**Subject:** the helpers in [lib/timezone](../client/lib/timezone.ts): `localToUTC()` / `localToUTCTime()` going in, and `sessionTimeInstant()`, `sessionSpan()`, `formatSessionSpan()`, `formatSessionTime()`, `utcTimeToLocal()` and `calendarDate()` coming back out.
**Why this exists:** sessions are scheduled in the admin's local timezone but persisted as UTC. Wrong conversion sends emails with wrong times and surfaces in calendar links. The tests pin DST, non-whole-hour offsets, and the ambiguous spring-forward / fall-back windows. Reading a time back is the harder half: `session_cases` holds a UTC time of day and `sessions.session_date` a Central date, so a time is the instant on that Central date, and an evening session's later times are on the next UTC day (from 7 PM CDT / 6 PM CST).

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
| `formatSessionTime` | A time is read on its session's date, not today's: a November (CST) session shown in October reads 10:00 AM, not 11:00 AM, and the reverse. An evening time is found on the next UTC day. |
| `sessionTimeInstant` | Daytime on the session's date; evening times on the next UTC day, including both clock-change Sundays; 24:00 is the next midnight; an impossible date (2026-13-45, Feb 30) reads like no date instead of throwing. |
| `calendarDate` | The date a date or timestamp starts with; null for anything that isn't a real date, including the ones `Date.parse` rolls over (Feb 30). |
| `sessionSpan` / `formatSessionSpan` | First start to last end as instants, in any row order. **Regression:** sorting the stored times as text lost the first case once a session crossed midnight UTC (5–6 + 6–7 PM CST read "6:00 PM – 7:00 PM"; 4–5:30 + 6:30–8 PM ended before it started). An end after Central midnight goes on the next day, and so does a start more than 18 hours before the latest one: 10–11:30 PM + 12–1 AM is 10 PM – 1 AM, not 23 hours, and an 11 PM case on the night the clocks go back reads as CST. A long day (8 AM and 9 PM cases) is left alone. No end time gives no end; unreadable times are skipped. |
| `utcTimeToLocal` | An evening on a clock-change Sunday uses that evening's offset in Central (7 PM CST on Nov 1 showed as 20:00, so saving the Reschedule form unchanged moved the session). In every zone the time is read on the session's date in that zone, so the Reschedule form's unchanged save gives back the stored time: London and Berlin on their clock-change weekend, New York, Los Angeles, Chicago and Kolkata. |

### 3.5 [api-route-handlers.test.ts](../client/__tests__/api-route-handlers.test.ts) — HTTP boundary

**Subject:** the four route handlers under [app/api/](../client/app/api/) and [app/auth/confirm/route.ts](../client/app/auth/confirm/route.ts).
**Why this exists:** these handlers are the only HTTP surface area in the app — every other interaction goes through server actions. They must validate input, surface upstream errors as HTTP status codes, and never leak internal state.

| `describe` | Coverage |
|---|---|
| `zip-lookup.test.ts` | Hits the **real** zippopotam.us + geo.fcc.gov endpoints. Asserts: 200 with a `state` for `78701`; 400 for non-numeric ZIP; 404 for `00000` (upstream-failure surfacing); graceful degradation to `county: ""` when the FCC endpoint throws. **Note:** this test reaches the internet — it can be flaky in restricted networks. Total budget: 15 s per case. |
| `convert-heic.test.ts` | The `heic-convert` library is mocked to behave like a real decoder (validates the `ftyp` magic, rejects > 10 MiB). Asserts a HEIC file converts to JPEG (SOI marker `0xFFD8`), a PNG is rejected, an 11 MiB payload returns 500 with a `too large` error. |
| `email-action.test.ts` | The one-click accept/decline endpoint. Generates a real signed token, drives `updateInviteStatus` via a spy, and asserts the **rendered HTML** contains the user-visible headline for each branch: success, already-responded, session-full, session-already-started, waitlisted, missing-profile (driver license + PayPal), expired token, tampered signature. Two branches carry extra assertions because getting them wrong misleads a participant about money: the started branch must **not** fall through to the session-full page (the catch-all for an unrecognised block reason), and the waitlist branch must **not** say "You're In!" — it has to name the waiting room and both amounts. <br><br>**The venue on the accept page:** an in-person accept shows the session's saved address on the page, escaped (an `<img onerror>` in it must come out as text). An in-person session with **no** saved address says the address will follow and makes no claim that it is already in their email, because only an invitation sent before addresses went out with the invite can land there. An online accept never reads `sessions`. The Supabase mock answers per table: `supabaseState.caseModes` feeds the `session_cases` read behind the delivery mode, and `supabaseState.sessionLocation` feeds the `sessions` read; both reset to online / no address. |
| `auth-confirm.test.ts` | Supabase `verifyOtp` is mocked. A valid `token_hash` redirects to `/dashboard`; an expired token redirects to `/auth/error?error=...`; a missing token redirects to `/auth/error?error=Invalid or missing token`. The redirect target is asserted by catching the `RedirectError` thrown by the mocked `next/navigation`. |

### 3.6 [authentication.test.ts](../client/__tests__/authentication.test.ts) — auth server actions + middleware

**Subject:** [app/auth/actions.ts](../client/app/auth/actions.ts) (`signupWithCustomEmail`, `resetPasswordWithCustomEmail`), the `setSession` / `updateUser` surface that backs the update-password form, and [lib/supabase/proxy.ts](../client/lib/supabase/proxy.ts)'s `updateSession` middleware.

| `describe` | Coverage |
|---|---|
| `signup-with-custom-email.test.ts` | **Age and Terms confirmation:** signup asks for one tick, "I am 18 or older and agree to the Terms of Service and Privacy Policy", not a date of birth (participants give one later, on the confidentiality agreement). Without `confirmedAgeAndTerms: "true"` (missing, empty or `"false"`) the action returns `SIGNUP_CONFIRMATION_MESSAGE` **before** `createUser` runs, so no auth user, `roles` row or email exists (the action is called directly here, proving the check is server-side, not just in the form). When the box is ticked, `app_metadata` (which only the service role can write) records `age_confirmed_at` and `terms_accepted_at` at the same time, plus `terms_version` / `privacy_version` set to `TERMS_LAST_UPDATED` / `PRIVACY_LAST_UPDATED`, the versions agreed to; `user_metadata` stays `{ role }`. Participant signup writes a `roles` row with `role: "participant"` as an **upsert on `user_id`** (the `assign_role_on_signup` trigger on `auth.users` has usually written the row already, and a plain insert would fail every signup) and sends a verification email containing the action link; same for `requestee`; duplicate-email flow returns `{ error: "User already registered" }` and **does not** insert a role row or send an email; a missing `role` — and `role: "admin"` — is rejected with `{ error: "Invalid role" }` **before** `createUser` runs, so no auth user, `roles` row or email is ever produced (regression guard: the server action is a public endpoint and `roles.role`'s CHECK allows `admin`, so this allowlist is the only thing stopping self-service admin signup). The confirm link's `redirectTo` is `${NEXT_PUBLIC_APP_URL}/auth/callback` even when the form posts a different `origin` (such as the old `texasjurystudy.vercel.app`): the host is built on the server, never taken from the caller. |
| `reset-password-with-custom-email.test.ts` | Known email sends a "Password Reset" subject line to the right recipient with the verification link in the body; **unknown email does not leak** — no email is sent, and the email address is not echoed in the response (defends against user-enumeration via differential output). The reset link's `redirectTo` is `${NEXT_PUBLIC_APP_URL}/auth/update-password` whatever `origin` is posted. |
| `update-password.test.ts` | Mocks the browser Supabase client. Valid recovery session calls `setSession` once and `updateUser` with the new password; expired session surfaces an `expired|missing` error; **mismatched confirm-password short-circuits before any Supabase call** (the submit guard, not the server, is the safety net). |
| `middleware.test.ts` | Unauthenticated request to `/dashboard` returns a 307 to `/auth/login`; authenticated request passes through (200, no `Location`); both `requestee` and `participant` are allowed through to `/dashboard` so the page's own role-router can run (regression guard — the middleware must not itself bounce them). |
| `confidentiality-gate.test.ts` | Mirrors the query path used by [app/dashboard/page.tsx](../client/app/dashboard/page.tsx): picks the right agreement table per role and decides allowed-vs-blocked. Asserts `requestee` is blocked with no row and both roles are allowed with `agreed: true`. |

### 3.7 [cases.test.ts](../client/__tests__/cases.test.ts) — case lifecycle

**Subject:** the case CRUD path; the real `approveCaseAction`, `rejectCaseAction`, `proposeScheduleAction` and `unapproveCaseAction` from [lib/actions/adminCase](../client/lib/actions/adminCase.ts); the real `updateCaseFilters` from [app/dashboard/requestee/actions/updateCaseFilters](../client/app/dashboard/requestee/actions/updateCaseFilters.ts); the real `updateCase`, `respondToSchedule` and `requestAgain` from [app/dashboard/requestee/actions/caseUpdates](../client/app/dashboard/requestee/actions/caseUpdates.ts); and copies of the inline archive / restore actions that still live in the requestee dashboard page.

The Supabase server client is a stateful mock: a queue of responses (`state.responses`) is shifted off in order as the action chains `.select() → .update() → .eq() → ...`. `state.captured` records every table call so tests can assert filter columns and payloads precisely: `eqs` for `.eq()`, and `filters` for `.in()`, `.is()`, `.not()` and `.or()`. The caller's own `roles` row, which `requireAdmin` reads, comes from `serverState.role` rather than the queue (`asAdmin()` sets it), so the positive tests keep their queued case rows.

| `describe` | Coverage |
|---|---|
| `create-case.test.ts` | Happy path inserts `title`, `user_id`, `filters` into `cases`; empty/whitespace title throws *before* any DB call; non-requestee role rejected with "requestee role required"; files > 50 MiB rejected with "exceeds the 50 MiB limit". |
| `approve-case.test.ts` | As an admin: updates `admin_status: "approved"` filtered by `id`, and calls `sendApprovalEmail(to, title)` exactly once. **Refused (F28):** the firm that owns the case, a participant, a blacklisted login and one with no `roles` row get "Not authorized", a signed-out caller "Not authenticated", with no `cases` call and no email. RLS doesn't stop the owner, since "user can update own cases" lets its login write its own row, so the action has to. |
| `reject-case.test.ts` | As an admin: updates `admin_status: "rejected"` and stores `rejection_reason`; calls `sendRejectionEmail(to, title, reason)`. Refused for the same callers as approve, before any `cases` call or email; a blank, whitespace-only or missing reason is refused first too, since the firm is emailed it. |
| `archive-case.test.ts` | Requestee archive: sets `status: "previous"`, `deleted_at: <iso>`, scoped by both `id` AND `user_id` (defense in depth); admin archive: same payload but **no `user_id` filter** (admin overrides ownership); requestee attempt against another user's case still emits the `user_id = self` filter — they cannot reach the row. |
| `restore-case.test.ts` | Admin restore flips `status → "current"`, `deleted_at → null`; requestee attempt against a foreign case is blocked by RLS while still emitting the `user_id` scope filter. |
| `update-case-filters.test.ts` | The persisted filter JSON round-trips unchanged; the education-hierarchy auto-fill is preserved end-to-end (covers the `filter-utils` ↔ `education-hierarchy` integration through the persist layer); both `id` and `user_id` filters applied to the UPDATE. |
| `confirm-schedule.test.ts` | The real `respondToSchedule`. Accepting reads the case only while a proposed time awaits an answer (`admin_scheduled_at` set, `schedule_status` null or `pending`, owned by the caller), writes `schedule_status: "accepted"` with `scheduled_at` copied from `admin_scheduled_at` (for a case already in a session, the case's start instead: `admin_scheduled_at` is then its end, so a 10-11 AM case became an 11 AM preference), and repeats that state and that exact time in the UPDATE, so a new proposal that lands in between isn't answered with this one. Declining writes `schedule_status` only. Any other answer is ignored before the case is read; nothing awaiting an answer means nothing is written. |
| `update-case.test.ts` | The real `updateCase` ("Edit Case Details"): the UPDATE is filtered by `id`, `user_id`, `status = current` and `admin_status in (all, rejected)`, so an approved case's hours, format and county stay what was approved. The format is dropped once the case is in a session. The Schedule field is read as Central Time (10:00 on Nov 5 is 16:00 UTC; `new Date()` on the UTC server stored it as 10:00 UTC, 4 AM CST), and a "Within a Week" deadline set at 8 PM CDT on Oct 14 is Oct 21, 11:59 PM CDT, counted from the Central date. That test runs in UTC, since on a Central machine the old code gave the same answers. An empty field clears both. Signed out: nothing written. |
| `request-again.test.ts` | The real `requestAgain`: `admin_status: "all"` with the reason cleared, only on the caller's current case that is `rejected`; without that filter a firm could pull an approved case off the Approved list and its session's Notify Presenter. Signed out: nothing written. |
| `propose-schedule.test.ts` | The real `proposeScheduleAction` (the Approved tab's Send): sets `admin_scheduled_at` from the admin's time read as Central Time, ignoring any zone the form sends (it used to send the browser's), and resets `schedule_status` to `"pending"` so the firm must confirm. A missing, partial or impossible date and time is refused before any write. Refused for a firm on its own case and every other non-admin, before any `cases` call. |
| `unapprove-case.test.ts` | The real `unapproveCaseAction`: sets `admin_status: "all"` for an admin; refused for anyone else before any `cases` call. |

### 3.8 [sessions.test.ts](../client/__tests__/sessions.test.ts) — sessions + invitations

**Subject:** the real actions in [lib/actions/session](../client/lib/actions/session.ts) (`createSession`, `addCasesToSession`, `inviteParticipants` and the `inviteToSession` helper behind it in [lib/participant/invite](../client/lib/participant/invite.ts), `notifyRequesteesSessionCreated`, `rescheduleSession`, `replaceCaseInSession`, `flagParticipant`, and the caller check of every other admin action), `recordBackoutStrike`, and `updateInviteStatus` from [lib/participant/updateInviteStatus](../client/lib/participant/updateInviteStatus.ts).

Both Supabase clients (`server` and `admin`) share the same stateful mock so a single test can drive a flow that crosses client boundaries. The caller's own `roles` row, which `requireAdmin` reads, is answered from `state.callerRole` rather than the response queue: a describe of admin actions starts with `asAdmin()`, and a refusal test sets the role it wants. The mail layer exposes a spy for every named export session.ts references (`allMailSpies`), so a test can assert that nothing at all was sent — if you add a new mail function and forget to add it to the factory, the test will fail at import time, which is the intended tripwire.

| `describe` | Coverage |
|---|---|
| `create-session.test.ts` | Admin caller: inserts into `sessions` with `created_by = admin.id` and `session_date` from the input; an online session's insert carries no `location`, and an in-person one's carries the trimmed venue address, because the invitations go out straight after the insert and must say where; a non-admin is refused by the action before the insert, even with `user_metadata.role` set to admin (users can edit their own metadata; only `roles` counts). |
| `add-cases-to-session.test.ts` | Inserts one `session_cases` row per case (length asserted); start_time / end_time are the admin's Central times as UTC (9:00 AM CDT is 14:00:00), whatever zone the admin's browser is in; each linked case's `admin_scheduled_at` is when it ends, on the same clock, targeted by case id. **Paid time:** a case given longer than its firm paid for (its hours, or 1 hour when empty) is refused before anything is written; all of the paid time, less, an empty request's hour and a case past midnight are fine; a case ending when it starts is refused. Every test that gets past the format guard enqueues `paidRead()` (the cases' titles and hours) next. <br><br>**No mixing formats:** a session holds in-person cases or online cases, never both. A mixed incoming selection is rejected, and so is an incoming case that clashes with what is already attached — in both cases the test asserts **no insert was captured**, because the guard runs *before* the write and a refused attach must leave the session exactly as it was. Uniform sets (all-offline, offline joining offline) pass. Every test here enqueues `modeGuard()` (2 responses) first; omitting it shifts the whole FIFO queue. |
| `reschedule-session.test.ts` | **The schedule-derived resync.** `payout_cents` and `eligible_after_at` are accept-time snapshots of the session's schedule, and the reschedule modal can change duration, not just the date. Asserts a lengthened session reprices seats (5h × $30), that an in-person session reprices at its own $40/hr, and that the cooldown moves to the new session end. The three negative cases are the valuable ones and each encodes a real hazard: a **waitlister's flat fee** is never recomputed as hours × rate; a **pre-backfill null** payout is never turned into money; and unreadable times **refuse to write $0** rather than zeroing every seat. A past-dated session is left alone entirely, since nothing in the schema records whether it was already paid. Both `toBeUndefined()` tests carry a witness assertion proving the resync ran and *chose* to skip, rather than passing because the action crashed earlier. **The emails give the new time:** participants get the whole session's span, and each firm the session's span plus its own cases' times (another firm's case in the session moves the span but isn't listed); the modal's times are stored as Central (2 PM CDT is 19:00). The date alone used to be sent, so a move to another time on the same day said "New Date: <the same date>". If the times can't be read back, the emails use the ones just written. **Paid time**, checked before the first write from a read of the session's cases (`currentRead()`, now the first response in `preamble()`): a case can't be made longer than its firm paid for; one that already ran longer, from before this was checked, can keep that length but not grow; and a case that isn't in the session is refused. A firm is told to confirm only when its dashboard will ask: not for a case already on its Past tab (Reschedule is on the admin's Past tab too), nor one moved to a time that has gone by. |
| `replace-case-in-session.test.ts` | Swaps in a case of the same format, and refuses one of the other format before touching the session, including when it would replace the session's only case. The incoming case's `admin_scheduled_at` is its real end, read on the session's Central date: a case ending 9 PM CDT on Oct 20 (stored 02:00) is 2026-10-21T02:00Z, where "session date + end" gave Oct 19, 9 PM, and the firm saw the evening before. Times it can't read are refused before any write, and so is an incoming case paid for less time than the slot it would take over. The incoming firm's email says when its case runs (7:30 PM – 9:00 PM CT), not just the date, and asks it to confirm only if the case is on its Approved tab. |
| `invite-participants.test.ts` | **Refused (F28):** anyone but an admin gets `{ ok: false, error: "Not authorized" }` (signed out: "Not authenticated"), a result rather than a throw like every other failed invite, before any participant's name is read; a refused invite used to come back naming the person. As an admin: one `session_participants` row per invitee, all with `invite_status: "pending"` and the right `session_id`; the action does **not** enforce `participant_cap` itself — the test mirrors the caller contract by trimming before invoking, documenting where the cap must be enforced; sends exactly one email per invitee to the resolved address. <br><br>**Format-aware invitation:** an online invite quotes $30/hr, carries `Remote (Secure Zoom)` in its JSON-LD and mentions the paid waitlist; an in-person invite quotes $40/hr, warns about travel, names the **Texas State ID** specifically, and quotes the **in-person** waitlist terms (30 minutes / $30). The negative assertions carry the weight: it must contain no driver's-license wording, no `Remote (Secure Zoom)` calendar location, and no `Zoom waiting room` — quoting a waitlister the wrong format's hold rules is the failure that matters. <br><br>**The venue goes out with the invitation:** whether someone can attend an in-person session depends on where it is, so the invite carries the saved `sessions.location`: in the body (with a Google Maps link) and in the JSON-LD `address`, and never says "once you accept" or "address to follow". The address is admin-typed, so a `<script>` in it must come out escaped in both places; the test runs the real `venueAddressBlock` (pulled into the mail mock with `importOriginal`) so it checks the actual escaping. An in-person session with no address, or only whitespace, **invites nobody**: no insert, no email, and an error naming the missing venue address. An online session never reads `sessions` at all. <br><br>Every test here enqueues `sessionMode()` first — the format is read before anything else — and an in-person test then enqueues the `sessions.location` row; `queueInviteResponses(ids, "offline", venue)` does both. Omitting them shifts the whole FIFO queue. <br><br>**The session time** is read on the session's date (a November session invited in October says 8:00 AM, not 9:00 AM), and an evening session whose cases cross midnight UTC is spanned from its first case: 5:00 PM – 7:00 PM CT. |
| `update-invite-status.test.ts` | `pending → accepted` records `responded_at` and a status flip; `pending → declined` skips the pre-checks; **session-started block** returns `{ blocked: true, reason: "session_started" }` — checked *first*, so no capacity or profile query is even issued; **session-full block** returns `{ blocked: true, reason: "session_full" }` only once the seats **and** the waitlist are gone, and never issues the update; **missing-profile block** returns `{ blocked: true, reason: "missing_profile", missing: [...] }` listing the unsatisfied fields (`dl`, `paypal`); declining after the session has started still succeeds and touches neither `sessions` nor `session_cases`; the **double-response gate** lives in the route handler — its contract (skip the action entirely if `invite_status` is already terminal) is asserted here at the layer boundary. <br><br>**Waitlist consent:** an invitation is written while seats are free, so accepting into a now-full session **asks before committing**. A bare accept returns `needsWaitlistConsent` with the position, the hold terms and both amounts, and writes **nothing** — asserted explicitly, since the whole point is that no row changes until the person agrees. Passing `{ confirmWaitlist: true }` then writes `invite_status: "waitlisted"` with `waitlist_position` 1 then 2 and the flat waiting fee as `payout_cents` — never the seat rate. Turning the offer down (`{ waitlistOfferDeclined: true }`) declines *and* stamps `waitlist_outcome: "offer_declined"` with no position or payout, so the roster can distinguish refusing a reserve slot from refusing the session; a plain decline records no reason. A normal seat records `payout_cents` = hourly rate × session length with a null `waitlist_position`. <br><br>**In-person sessions:** a seat records the $40/hr rate; a full one returns `needsWaitlistConsent` carrying the **in-person** terms (`holdMinutes: 30`, `waitFeeCents: 3000`, `hourlyRateCents: 4000`) and still writes nothing; confirming it records **$30** as `payout_cents`, not the online $10. An identical online session is asserted alongside, so the delivery mode is proven to be what changed the terms rather than the numbers. <br><br>Every accept-path case must enqueue `notStartedYet()` (2 responses) then `occupancy()` (**4** responses — caps, delivery mode, accepted count, waitlist count) after the invite row — both gates run before the rest, so omitting them shifts the whole FIFO queue. `occupancy({ deliveryMode: "offline" })` is the switch for the in-person cases. <br><br>**The time in the acceptance emails:** the tests above stop at the main update, so a separate block runs an accept through to the emails (the main update hands the row back), with the clock faked. The session's own date and times decide everything: a November session accepted in October is emailed 10:00 AM – 12:00 PM CT (on today's offset it said 11:00 AM), a March one accepted in November likewise, and an evening session whose cases cross midnight UTC is emailed 5:00 PM – 7:00 PM CT, pays 2 hours and gets its cooldown a day after its real end. The waitlist confirmation carries the same span and writes no cooldown. |
| `recordBackoutStrike` | From [lib/actions/participantFlags](../client/lib/actions/participantFlags.ts). Stamps `struck_at` (and `struck_by` when the admin is known) on that session's invite row; striking the same session twice is a no-op; no invite, no write. Each strike bumps `flag_count`; the third blacklists through `markBlacklisted` (roles `blacklisted`, a reason naming the limit). A legacy `oldData` id gets the strike but no count and no blacklist. |
| `flagParticipant` | The admin action in front of it. Three strikes blacklist, so a participant, requestee, blacklisted or signed-out caller is refused before anything but their own `roles` row is read; an admin's strike records them as `struck_by`. |
| `notifyRequesteesSessionCreated` | The firm's **Session Scheduled** email. Several firms' cases can share one session, so each firm gets **its own case's time**, read from that case's `session_cases` row, alongside the whole session's span. Two firms in one session each get only their own slot. A firm with two cases gets one time per case, in title order, paired by `case_id`: the `session_cases` rows come back in the opposite order, so pairing by position would swap them. The mail function is a spy, so these tests check what the action passes it, not the rendered HTML. The clock is held in October (CDT) and the sessions are in November (CST), so a time read on today's date instead of the session's is caught whenever the suite runs. An evening session whose cases cross midnight UTC is spanned from its first case, and each firm still gets its own case's time. |
| `admin-only session actions` | **F28.** For each of `createSession`, `addCasesToSession`, `notifyRequesteesSessionCreated`, `rescheduleSession`, `adminRespondOnBehalf`, `callInWaitlistParticipant`, `markWaitlistWaitedOut`, `updateSessionParticipantCap`, `sendCompletionNow`, `sendZoomLink`, `sendSessionLocation`, `replaceCaseInSession` and `notifyPresenterByEmail`: a participant, firm, blacklisted login or login with no role gets "Not authorized" and a signed-out caller "Not authenticated", with arguments that would otherwise reach a write or an email, and no table but the caller's `roles` row is touched (the service-role client shares the log, so its reads count too) and no mail spy is called. Admin paths for the three with no other coverage: `updateSessionParticipantCap` refuses a cap below 1 or not a whole number before writing, and writes an admin's new cap; `sendZoomLink` emails the seated and the waitlisted their templates and saves the link; `notifyPresenterByEmail` mails the given address the case and its Drive links, and still marks the case `submitted`; `adminRespondOnBehalf` emails the whole session in CT (it printed one case's raw UTC times, "16:00:00 – 17:00:00"), the same span as the Zoom email it sends next, and pays an evening seat for 2 hours. |

Not covered (F28): the `cases_protect_admin_fields` trigger (no database in this suite; the migration checks itself as a firm and as an admin before committing); the inline `approveCase` action on the Admin dashboard page and `handleCreate` on the new-session page, which tests can't import from a page file, and each of which calls actions pinned here; and the admin pages' own `requireAdminPage()` check, since this suite renders no pages.

### 3.8b [delivery-mode.test.ts](../client/__tests__/delivery-mode.test.ts) — online vs in-person

**Subject:** the pure half of the offline-case feature — [lib/case/deliveryMode](../client/lib/case/deliveryMode.ts), the rate functions in [lib/receipt-pricing](../client/lib/receipt-pricing.ts), and the payout/waitlist functions in [lib/participant/waitlist](../client/lib/participant/waitlist.ts).

**Why this exists:** one column, `cases.delivery_mode`, decides three unrelated money-or-logistics questions — what the requestee is quoted ($850/hr vs $1,500/hr), what participants earn ($30/hr vs $40/hr), and the waitlist's hold window and flat fee (15 min/$10 vs 30 min/$30). A misread of that column is a 1.8× billing error or a 3× waiting-fee error, so the arithmetic is asserted directly rather than only through the accept path.

| `describe` | Coverage |
|---|---|
| `normalizeDeliveryMode` | Only the two literal values pass through. **Everything else — `null`, `undefined`, `"Offline"`, `"OFFLINE"`, `"in-person"`, non-strings — degrades to `online`**, the cheaper and safer regime. A bad value must never be read as the in-person rate. |
| `isOffline` / `deliveryModeLabel` | Both read the mode through the same normalization, so a value that normalizes to online can never render as "In-Person". |
| `sessionDeliveryMode` | Returns `null` for a session with no cases (nothing to derive from), the shared mode otherwise, and **throws** on a mixed set rather than guessing a rate. `sessionDeliveryModeOrDefault` is the non-throwing twin for read-only surfaces. |
| `assertCasesShareDeliveryMode` | The guard behind `addCasesToSession` / `replaceCaseInSession`. Accepts uniform sets and empty sets; rejects a mix inside the incoming cases *and* an incoming case that clashes with what is already attached. |
| `requestee pricing` | $850/hr vs $1,500/hr base; the $100-per-filter add-ons are **unchanged** by mode (asserted equal across both); omitting the mode argument reproduces the pre-feature quote exactly, which is what keeps every existing call site correct. |
| `participant payout` | $30/hr vs $40/hr, scaled by session length; omitting the mode gives the online rate; a called-in waitlister is paid at the session's own rate; the flat waiting fee is **$10 online vs $30 in person** and is asserted flat (session length must not move it). |
| `waitlist terms` | Both formats offer the **same number** of slots (the stored cap, default 2) — asserted across online, offline and null. What differs is the hold window (15 vs 30 min) and the waiting fee ($10 vs $30), each asserted against its named constant. |

| `county name matching` | The `'Harris'` vs `'Harris County'` normalisation, both directions. Includes the negative that shapes the implementation: **Harris must not match Harrison County**, which is why the query lists two exact spellings instead of a `Harris%` prefix — asserted by checking no query form contains a wildcard. |
| `in-person catchment` | The six counties match participants under either spelling and exclude Collin / Dallas / Smith / Lubbock, where most of the panel actually lives. Asserts the catchment is **not** expressed as a `location` filter (`FILTER_PRIORITY[0]`, which `relaxFilters` drops first), and that `withCountyRestriction` no longer forces an offline case's own county while still honouring an explicit "participants from my county". |

The write-side counterparts live in [sessions.test.ts](../client/__tests__/sessions.test.ts): the no-mixing rejection at `addCasesToSession`, the in-person seat payout ($40/hr), "a full in-person session offers a waitlist slot on IN-PERSON terms" (paired with an identical online session, so the mode is proven to be what changes the terms), "an in-person waitlist accept records the $30 waiting fee, not $10", and the invite-email assertions for both formats.

### 3.9 [rls.test.ts](../client/__tests__/rls.test.ts) — RLS policy intent (simulator)

**Subject:** **a TypeScript simulator of the RLS policies**, not real PostgreSQL. The simulator encodes the access rules so they can be reviewed in code review alongside the SQL migrations under [supabase/migrations/](../supabase/migrations/) and the description in [docs/rls-policies.md](./rls-policies.md).

> **Regression gap, in writing:** if a SQL migration changes a policy without updating the simulator, these tests will still pass. The simulator is a **specification check**, not an integration check. Closing this gap requires a Dockerized Supabase running in CI — that work is intentionally out of scope for this file.

| `describe` | Policy guaranteed |
|---|---|
| `rls-roles.test.ts` | `roles` table is immutable from the client. Any non-`service_role` UPDATE returns `42501`. Specifically asserts a requestee cannot self-promote to admin by writing their own `roles` row. |
| `rls-cases.test.ts` | `admin` reads all cases; `requestee` reads only cases where `user_id = auth.uid()`; `participant` reads none. |
| `rls-case-documents.test.ts` | Visibility flows through case ownership — same partitioning as `cases`. A document attached to a foreign case is never visible. |
| `rls-session-participants.test.ts` | A `participant` sees only invites where `participant_id = auth.uid()`. |
| `rls-jury-participants.test.ts` | `participant` sees their own full row (PII included). `admin` sees every row including PII. `requestee` gets **no rows** (migration `20261002_requestee_no_participant_access.sql`; `oldData` likewise). RLS can't hide columns, so this used to be modelled as a column projection the database never had; what a firm may see is now enforced in server code and pinned in [§3.20](#320-requestee-participant-accesstestts--what-a-law-firm-can-see). |
| `rls-storage-objects.test.ts` | **Storage-bucket RLS (F23, 2026-06-09).** Simulates the `storage.objects` policy set: owner-scoped self-service (a participant reads/overwrites/deletes only their own `id-documents` license; a requestee only their own `case-documents`), with cross-user reads/deletes denied (`42501`) — the closed leak. `admin` reads all in both buckets and may overwrite an existing `id-documents` object (the admin license-replace path, policy #4) but is **not** granted UPDATE on `case-documents`. INSERT is owner-scoped (caller becomes owner). `service_role` bypasses RLS (the video upload script). **2026-10-07:** ID photos moved to GCS — the `id-documents` half of these policies is retained only until the old Supabase bucket is deleted; live ID-photo authorization is [lib/actions/idPhotoUrls.ts](../client/lib/actions/idPhotoUrls.ts), pinned in [§3.18e](#318e-id-photo-urlstestts--signed-urls-for-id-photos-the-gcs-security-boundary). |

### 3.10 [documents-drive-links.test.ts](../client/__tests__/documents-drive-links.test.ts) — case attachments

**Subject:** the real `uploadCaseDocument` / `deleteCaseDocument` / `getCaseDocumentUrl` from [app/dashboard/requestee/actions/caseDocuments](../client/app/dashboard/requestee/actions/caseDocuments.ts) and `addDriveLink` / `deleteDriveLink` from [app/dashboard/requestee/actions/caseDriveLinks](../client/app/dashboard/requestee/actions/caseDriveLinks.ts).

The Supabase mock here is extended with a **storage** facade so `storage.from(bucket).upload / remove / createSignedUrl` are captured alongside table operations, and a service-role mock answers the ownership check (`ownsAllCases` in [lib/participant/requesteeAccess](../client/lib/participant/requesteeAccess.ts)) from `state.cases`: `req-1` created `case-A`, `case-XYZ` and `case-1`, is the assigned requestee on `case-assigned`, and `req-2` owns `case-other`.

**Why the ownership checks exist (F28):** neither the `case_documents` INSERT policy, the `case_drive_links` policy nor the storage policy looks at the case, so these actions were all that could stop a file or link landing on another firm's case, where admins and the presenter email took it for that firm's own.

| `describe` | Coverage |
|---|---|
| `upload-case-document.test.ts` | Uploads land in the `case-documents` bucket at `{caseId}/{uuid}.{ext}`; a `case_documents` row is inserted with `case_id`, `uploaded_by = user.id`, `original_name`, `mime_type`, `storage_path`, `file_size`; an unauthenticated call throws *before* touching storage or DB. Another firm's case, or no such case, is refused before anything is uploaded; the assigned requestee may upload; a file whose row can't be saved is removed again rather than left in storage. |
| `delete-case-document.test.ts` | Removes the storage object **and** deletes the DB row; the file removed is the `storage_path` on the caller's own row, never a path from the browser, and both the read and the delete are scoped by `uploaded_by = user.id` (owner-only guard — the regression vector is dropping the `uploaded_by` filter and letting a requestee delete someone else's document). A document that isn't the caller's: no file removed, no row deleted. |
| `case-document-url.test.ts` | Signs the `storage_path` of a document on the caller's own case; a document on someone else's case (one planted there before the upload check), or one the caller can't see, gets "Document not found" and nothing is signed; signed out is refused. |
| `add-drive-link.test.ts` | A valid `http(s)://` URL is trimmed and persisted with `case_id` and `uploaded_by`. Not a URL, a scheme-less link, `javascript:`, `data:` and `ftp:` are all rejected by the action itself before any read or write, since admins open the link and the presenter email carries it; another firm's case is refused; signed out is refused. |
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
| `case-lineage involvement classification` | Only two states spend a participant: `accepted`, and an unanswered invite to a session that has not happened (`pending-upcoming`, which stops one person accepting two sessions in the same chain). Accepted-then-**struck** classifies as `struck` and does **not** block — they backed out or never showed, so they never sat on the case. `declined` (and the legacy `rejected` spelling) and a past unanswered invite (`no-response`) do not block either. A **waitlisted** row does not block even on an upcoming session — the reserve slot is not participation, and a call-in flips the row to `accepted`, which blocks on its own. A session dated **today** counts as upcoming, today being the Central date: at 7:05 PM CDT, when the UTC date has already turned over, that evening's session is still upcoming. When someone appears on several cases in one chain the blocking classification wins. A case with no sessions yields an empty map. |
| `splitLineageInvolvement` | Partitions an involvement map into blocked ids and the non-blocking history the UI shows as "Previously invited — …" next to a still-selectable name; asserts nobody lands in both halves, and that the split agrees with `isLineageBlocking`. |

### 3.13b [central-today.test.ts](../client/__tests__/central-today.test.ts) — which day it is, for sessions

**Subject:** `centralToday()` from [lib/centralToday](../client/lib/centralToday.ts), and two readers that use it, `getCaseSessions` and `getParticipantSessionHistory`, over a table-keyed fake client (as in §3.13) with the clock faked.

**Why this exists:** `sessions.session_date` is a Central calendar date, but "today" used to come from the server's UTC clock, whose date turns over at 7 PM CDT / 6 PM CST. So each day's evening sessions counted as past while they were starting: My Sessions said "Completed" and hid the Zoom link and address, the admin lists moved them to Past, and the admin case page badged them Completed. Every page and helper that asks whether a session date has passed now compares it with `centralToday()`.

| `describe` | Coverage |
|---|---|
| `centralToday` | The Central date at 7:05 PM CDT (UTC already the next day), at 11:59:59 PM and at midnight; the same turnover on standard time (Nov 5); reads the clock by default. |
| an evening session stays upcoming until Central midnight | A 7-9 PM CDT session is not past at 7:05 PM on the admin case page (`getCaseSessions`) or in a participant's session history, where it isn't counted as attended yet; at Central midnight it is past in both. |
| nothing takes today's date from the UTC clock | The pages that decide "past" (My Sessions, the participant dashboard, the admin lists, the sidebar count) aren't rendered by this suite, so this reads the source of `app/`, `lib/` and `components/` and fails on `new Date().toISOString().slice(0, 10)`, `.split("T")[0]` or `setHours(0, 0, 0, 0)` outside two allowed files, each with its reason: `lib/timezone.ts` (a time read without a session date) and `EditProfileForm.tsx` (the date-of-birth input). |

Also, in [sessions.test.ts](../client/__tests__/sessions.test.ts), a session rescheduled at 7:05 PM CDT to 8 PM that evening has its payouts repriced, since it isn't dated in the past.

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

**Why this exists:** these are the rules behind "you can no longer accept this invitation" and "you are on cooldown until the day after your session". `session_cases.start_time` / `end_time` are stored **UTC** (`addCasesToSession` runs the admin's local input through `localToUTCTime`), and the session date is a **Central** date, so a case time is the instant on that date found by `sessionSpan` in [lib/timezone](../client/lib/timezone.ts) (§3.4), not "session date + time Z": an evening session's later times are on the next UTC day (from 7 PM CDT / 6 PM CST), and reading them the plain way closed its invitations a day early and ended its cooldown a day early.

> **These assertions only bite on a non-UTC host.** Every instant is built from an explicit `Z` time; drop it and the values still match on a UTC machine (Vercel) while drifting by the offset everywhere else. The dev machine here is UTC+5:30, which is how the cooldown bug was caught — do not "simplify" these to local-time parsing.

| `describe` | Coverage |
|---|---|
| `sessionStartInstant` | Anchors to the **earliest** case start across the session, not the first row returned; accepts `HH:MM` as well as `HH:MM:SS`; tolerates a full timestamp in the date column; falls back to the start of its Central date when a session has no case times (it cannot be run without cases, so the day itself closes it; midnight UTC closed it at 7 PM the evening before); returns `null` for a missing or unparseable date, including one shaped like a date that isn't (2026-13-45, Feb 30), which used to throw; skips unparseable times rather than throwing. An evening start is on the next UTC day (7:30 PM CDT on Oct 20 is 2026-10-21T00:30Z); an evening session whose cases cross midnight UTC starts at its first case; and a case after Central midnight following an evening one doesn't become the start. |
| `hasSessionStarted` | False one second before the first case, true exactly at the start instant, and stays true during and long after the session; **false earlier the same day** — the gate is the case start, not midnight; an unreadable date does not block, on the principle that a response should get through rather than be rejected on a row we cannot parse. **Regression:** an evening session (7:30 PM CDT on Oct 20, stored 00:30) closed at 7:30 PM on Oct 19; it now stays open until it begins. |
| `sessionEndInstant` | Takes the latest case end: an end after midnight UTC is on the next UTC day (a 19:30→22:30 plus 22:30→00:30 session ends at 00:30 the following morning, not 22:30), an evening session whose cases cross midnight UTC ends at its last case, and an end after Central midnight is rolled onto the next day (10 PM to 1 AM CDT). Falls back to the start instant when no end times exist; null on an unreadable date. |
| `cooldownAfterSession` | The day after the session ends, in UTC. **Regression:** the cooldown used to be built as `new Date(\`${date}T${endTime}\`)` with no `Z`, so it parsed in the *server's* local zone and was correct only by luck on a UTC host — on this repo's dev machine (UTC+5:30) it landed 5.5 hours early. Also asserts month-end (Aug 31 → Sep 1) and year-end (Dec 31 → Jan 1) rollover, which the old `Date.setDate()` approach computed in local time; null times, or a date that isn't one, leave the cooldown untouched rather than writing a wrong one. Counts from the real end of an evening session (a day after 9 PM CDT on Oct 20, not after Oct 19) and of one running past Central midnight. |

### 3.16 [waitlist.test.ts](../client/__tests__/waitlist.test.ts) — reserve slots and payouts

**Subject:** the real `assignSlot` / `sessionLengthHours` / `seatPayoutCents` / `waitlistPayoutCents` / `formatCents` / `isWaitlisted` from [lib/participant/waitlist](../client/lib/participant/waitlist.ts) — pure.

**Why this exists:** once a session's seats are gone the next people to accept take waitlist slots, hold in the Zoom waiting room, and are paid one of two amounts. That arithmetic decides real money, so it is asserted directly rather than through the accept path.

| `describe` | Coverage |
|---|---|
| `assignSlot` | Seats fill first, the waitlist opens **exactly at** the cap, and an accept is refused only once both are gone. Includes the past-the-cap case: calling a waitlister in deliberately pushes accepted to 11/10, which must not wrap around into offering seats again. A `waitlist_cap` of 0 restores the old refuse-at-cap behaviour. |
| `sessionLengthHours` | Spans the earliest start to the latest end across every case, read as instants on the session's date (§3.4); handles a single case, a half-hour session, one ending after midnight UTC, and one running past Central midnight. **Regressions:** a 19:30→22:30 plus 22:30→00:30 session measured 3 hours instead of 5, because `max()` picked 22:30 over 00:30; and comparing stored times as plain minutes mismeasured evening sessions whose cases cross midnight UTC, 5–6 + 6–7 PM CST as 1 hour (paid $30, not $60) and 4–5:30 + 6:30–8 PM CST as 23. A 10–11:30 PM + 12–1 AM session is 3 hours, not 23. An end of 24:00 is midnight. Missing or unparseable times yield 0. |
| `payouts` | A seat earns the hourly rate × session length, rounded to whole cents; a **called-in** waitlister earns the FULL session, not the remainder from when they were admitted; a **waited-out** waitlister earns the flat fee regardless of how long the session ran. `formatCents` renders a missing amount as an em dash rather than `$0.00`, so an unrecorded payout never reads as "owed nothing". |
| `isWaitlisted` | Matches only the `waitlisted` status — never `accepted`, `pending`, or null. |

### 3.16b [participant-session-history.test.ts](../client/__tests__/participant-session-history.test.ts) — the time on a participant's Session History

**Subject:** the real `getParticipantSessionHistory` from [lib/participant/getParticipantSessionHistory](../client/lib/participant/getParticipantSessionHistory.ts), the admin "Session History" panel on a participant's profile, with both Supabase clients mocked (an admin caller, and the invites the service-role read returns) and the clock faked.

| Case | Coverage |
|---|---|
| Session's own date | A November session viewed in October reads 10:00 AM – 12:00 PM CT, and an October one viewed in November likewise; on today's offset each was an hour off. |
| Evening session | Cases crossing midnight UTC are spanned from the first one: 5:00 PM – 7:00 PM CT. |
| No case times | "Time TBD". |

### 3.17 [age-gate.test.ts](../client/__tests__/age-gate.test.ts) — minimum-age rule

**Subject:** the real `ageOn` / `dateOfBirthError` / `isUnderage` / `todayIso` from [lib/age-gate](../client/lib/age-gate.ts) — pure.

**Why this exists:** every account must be 18+ (Terms §2, Privacy §12, Texas juror eligibility), and a stored date of birth showing a child under 13 is COPPA "actual knowledge". The same helper backs signup, the confidentiality agreement, profile edit and the admin DOB action, so its boundaries are pinned here once. The database has a matching trigger (`supabase/migrations/20260929_adult_date_of_birth.sql`) that these tests do not cover.

| `describe` | Coverage |
|---|---|
| `ageOn` | Birthday already passed / not yet reached this year; the birthday itself counts; the day before is one short; a Feb 29 birthday is reached on Mar 1 in non-leap years. Non-existent dates (`2001-02-29`, `2000-04-31`, month 13) and anything not `YYYY-MM-DD` return null rather than rolling over into a real date. `today` is built with the local-time constructor so results don't depend on the machine's timezone. |
| `dateOfBirthError` | Exactly 18 today passes; one day short is rejected with `UNDERAGE_MESSAGE`, as is a child under 13; empty / null / undefined asks for a date; future dates, ages over 120 and garbage are "invalid", not "underage". |
| `isUnderage` | True one day short of 18 and for a child under 13; false on the 18th birthday. Missing, malformed, future and implausible dates are all **false** — this is the flag that deletes an account, so a bad date must stay a form error. |
| `todayIso` | Local date, zero-padded, for a date input's `max`. |

### 3.18 [underage-account.test.ts](../client/__tests__/underage-account.test.ts) — deleting an under-18 account

**Subject:** the real `deleteAccountIfUnderage` server action from [lib/actions/underageAccount](../client/lib/actions/underageAccount.ts), with `@/lib/supabase/server` (the caller's session), `@/lib/supabase/admin` (rows, `auth.admin.deleteUser`) and `@/lib/gcs/idDocuments` (the GCS `id-documents` bucket — see [§4.5](#45-gcs-id-documents-module-mock)) mocked. Every mutating call is appended to one ordered log, so the tests assert both *what* was deleted and *in what order*.

**Why this exists:** when a participant enters an under-18 date of birth on the confidentiality agreement or their profile, we now have actual knowledge they're a minor, so the account and everything stored about them is permanently deleted rather than the date just being refused. This is irreversible, so the guards matter as much as the deletion. A blacklisted participant is refused instead (F27 in [rls-policies.md](./rls-policies.md)): deleting them would erase the blacklist and let them sign up again with the same email.

| Case | Coverage |
|---|---|
| Nothing deleted | An adult date; a missing, malformed or future date; a signed-out caller. |
| Refused | An admin or requestee, with `UNDERAGE_MESSAGE` (neither enters a DOB: signup asks only for an 18+ and Terms tick, and a requestee's cases are shared with other people). A blacklisted participant, by either marker: `roles` says `blacklisted`; `roles` says `participant` but `blacklisted_at` is set; or there's no `roles` row and `blacklisted_at` is set. They get exactly `UNDERAGE_MESSAGE` plus "To close your account, please email `SUPPORT_EMAIL`.", nothing is deleted although an ID photo is on file, and the server warning names the user id, never the date of birth. |
| What is deleted | Every ID image under `<userId>/` in the GCS `id-documents` bucket, then `session_participants` → `jury_participants` → `confidentiality_agreements` → `roles`, then the auth user. The path `driver_license_image_url` points at is removed only when it is inside that folder: the participant can write that column, and the storage module deletes as the app's service account (GCS has no per-user ACLs), so a link into another user's folder (or one containing `..`) is left alone and logged by user id for an admin. Every call is keyed on the **session's** user id — the action takes no id argument, and the mock answers only reads keyed on that id, so a wrong-key lookup can't pass. Legacy participants with no `roles` row are deleted too; an empty bucket skips the storage call. |
| Failure | A failed blacklist lookup deletes nothing and returns the "please contact us" result. The mock fails only that read, so a version that treated the failure as "not blacklisted" would go on to delete and show in the log. A failed row delete stops **before** the auth user goes, so the login survives and a retry can finish (every step is idempotent). The server log names the user id, never the date of birth. A failed auth delete is reported, not claimed as success. |

Not covered: the two callers (`app/dashboard/page.tsx`, `components/EditProfileForm.tsx`), which sign the user out locally and route to `/auth/account-removed` — this suite runs in a node environment with no component rendering.

### 3.18b [id-photos.test.ts](../client/__tests__/id-photos.test.ts) — deleting replaced ID photos

**Subject:** the real `removeReplacedIdPhotos` server action from [lib/actions/idPhotos](../client/lib/actions/idPhotos.ts), with `@/lib/supabase/server` (the caller), `@/lib/supabase/admin` (the roles and profile rows) and `@/lib/gcs/idDocuments` (`listIdPhotos` / `removeIdPhotos` on the GCS `id-documents` bucket — see [§4.5](#45-gcs-id-documents-module-mock)) mocked. Every storage call is logged, so the tests assert which folder was listed and exactly which files were removed.

**Why this exists:** every ID upload gets a new timestamped name, so replacing a licence photo, or retrying a signup whose save failed, used to leave the old copy of someone's ID in the bucket; 71 had built up by 2026-10-03. The storage module acts as the app's GCS service account — GCS has no per-user authorization — so the action checks the caller itself.

| Case | Coverage |
|---|---|
| Removed | Every file in `<userId>/` except the one `driver_license_image_url` points at, for the participant themselves or for an admin. |
| Kept | The linked photo; anything uploaded in the last 10 minutes, since another save may be about to link it (two tabs, or an admin and the participant at once), even when it's older than the linked one; a file with no upload time. Nothing at all while the profile has no photo. |
| Refused | Anyone else (participant, requestee, blacklisted, no `roles` row) before the folder is listed; a signed-out caller; an empty id. |
| Failure | A failed list or remove (the GCS module **throws**; it does not return `{ error }`) or a failed profile read is logged with the user id and returns 0 instead of throwing, so a save that already succeeded isn't failed. |

Not covered: the two callers, which run it as the last step of a successful save (`components/EditProfileForm.tsx`, `components/ParticipantForm.tsx`). `EditProfileForm` only sends `driver_license_image_url` when that save uploaded a photo, so a page loaded before a replacement can't point the profile back at a deleted file. Also not covered: `client/scripts/cleanup-id-photos.mjs`, which finds photos no participant links to (list-only unless run with `--delete --expect=N`).

### 3.18c [auto-blacklist.test.ts](../client/__tests__/auto-blacklist.test.ts) — blacklisting from the profile answers

**Subject:** the real `autoBlacklistIfIneligible` server action from [lib/actions/autoBlacklist](../client/lib/actions/autoBlacklist.ts) and the real `markBlacklisted` from [lib/participant/blacklist](../client/lib/participant/blacklist.ts), with `@/lib/supabase/server` (the caller) and `@/lib/supabase/admin` mocked. Every read and write is logged.

**Why this exists:** it's a server action, so anyone signed in can call it with any id. It used to take the answers as arguments and lift any blacklist when they looked eligible, so anyone could blacklist anyone, and a blacklisted participant could clear an admin's blacklist, or the back-out one, by saving their profile. It now reads the answers from the database, acts only for the participant or an admin, and only ever adds a blacklist; lifting one is an admin's call (`unblacklistParticipant`). Nothing on the participant's own row can decide that safely, because participants can write every column of it (see F26 in [rls-policies.md](./rls-policies.md)).

| Case | Coverage |
|---|---|
| Blacklisted | Saved "convicted felon: Yes" and/or "US citizen: No" → `roles` `blacklisted`, then the reason (each one named), the time and approval cleared on `jury_participants`. Also when an admin saves the profile; for a legacy participant with no `roles` row, who gets one (unless their row already says blacklisted); and when the participant's own row claims `blacklisted_at` but `roles` doesn't, since `roles` is what they can't write. |
| Left alone | Eligible answers. An existing blacklist, whatever its reason, whether the answers are now fine or another one turned ineligible: nothing is lifted or relabelled. Admins and requestees, and anyone with no participant profile. |
| Refused | Anyone but the participant or an admin, before the participant is read; a signed-out caller; an empty id. |
| Failure | Logged with the user id; never throws, because the forms await it after the save has succeeded. |
| `markBlacklisted` | Upserts the `roles` row rather than updating it: a login can be missing one (557 were, until the 2026-10-03 backfill), and an update would leave them marked only on their own row, which they can clear. Still writes `jury_participants` when the `roles` write fails, then reports it; a profile with no login (`23503`, so it can't have a `roles` row) is blacklisted on `jury_participants` alone without an error; both failures are named together. |

Not covered: the callers, which each call it after the answers are saved (`EditProfileForm`, `ParticipantForm`, and `handleUpdate` on the admin edit page).

### 3.18d [admin-participant-auth.test.ts](../client/__tests__/admin-participant-auth.test.ts) — admin-only participant actions

**Subject:** the real `verifyParticipant`, `blacklistParticipant`, `unblacklistParticipant`, `adminUpdateParticipant` and `adminUpdateParticipantDob` from [lib/actions/adminParticipant](../client/lib/actions/adminParticipant.ts), and `requireAdmin` from [lib/requireAdmin](../client/lib/requireAdmin.ts). `@/lib/supabase/server` supplies the caller and their `roles` row; `@/lib/supabase/admin` logs every read and write.

**Why this exists:** these server actions had no caller check, so anyone signed in could approve themselves, lift their own blacklist, blacklist anyone, or rewrite any participant's profile, PayPal username included. Each now starts with `requireAdmin()`.

| Case | Coverage |
|---|---|
| Refused | A participant (even for their own id), a requestee, a blacklisted login or one with no `roles` row get "Not authorized"; a signed-out caller gets "Not authenticated". Either way nothing is read or written. |
| Admin | Each action writes the tables it should. |
| `blacklistParticipant only blacklists participants` | **F28, defence in depth for an admin's own call.** `markBlacklisted` overwrites the `roles` row, so an admin target (the caller's own id included) or a firm is refused with "Only participants can be blacklisted." and nothing is written; a participant, one already blacklisted and a profile with no `roles` row are still blacklisted; a failed target lookup writes nothing. |
| `adminUpdateParticipant writes only the edit form's fields` | The service role writes whatever it is given, so approval, the blacklist fields, `flag_count`, `eligible_after_at`, `reactivation_status`, `email`, `user_id` and `id` in the payload are dropped; the form's real payload is written in full except the unchanged `email`. An ID photo path outside `<userId>/` (another participant's folder, `..`, a subfolder, an empty name, `null` or a non-string) is refused before any read or write; one inside it is accepted whatever the case of the id in the page's URL. |

`sendReactivationEmails` is pinned in §3.19 and `flagParticipant` in §3.8.

### 3.18e [id-photo-urls.test.ts](../client/__tests__/id-photo-urls.test.ts) — signed URLs for ID photos (the GCS security boundary)

**Subject:** the real `getIdPhotoReadUrl` / `getIdPhotoUploadUrl` server actions from [lib/actions/idPhotoUrls](../client/lib/actions/idPhotoUrls.ts), with `@/lib/gcs/idDocuments` mocked (the fakes return `https://signed.example/...` URLs and log every signing call — see [§4.5](#45-gcs-id-documents-module-mock)) and the Supabase server/admin clients supplying the session, the `roles` row and the `jury_participants` row, answered only for lookups keyed on the caller's own user id.

**Why this exists:** ID photos moved from Supabase Storage to GCS, and GCS has no RLS — these two actions are the only way a browser gets a URL into the `id-documents` bucket, replacing the storage policies (owner ALL / admin SELECT / admin UPDATE) described in [rls-policies.md](./rls-policies.md). A hole here is a stranger reading driver's licences, so the full caller matrix is pinned, including that a refused caller never reaches the signing module.

| Case | Coverage |
|---|---|
| Read allowed | Any file in the caller's own folder (`<callerId>/...`), with or without a `roles` row; an admin for any path; the exact path the caller's **own** `jury_participants.driver_license_image_url` points at (legacy rows hold out-of-folder paths). |
| Read refused | A signed-out caller; a participant, requestee or blacklisted login (or no `roles` row) asking for another user's path — with no signing call made. A near-miss legacy path (the caller's profile points elsewhere in the same folder) is refused too. |
| Unsafe paths | `..`, a leading `/` and a `gs://` prefix are rejected before any storage call, even for an admin, and even when the path still starts with the caller's own folder. |
| Upload allowed | The caller for themselves; an admin for any participant's folder (the admin edit flow). The returned path is built **on the server** — `<targetUserId>/<Date.now()>-id.<ext>` — the signing call carries exactly that path and the request's content type, and all four whitelisted extensions (`jpg`, `jpeg`, `png`, `webp`) work. |
| Upload refused | A signed-out caller; a non-admin targeting anyone else; a file extension outside the whitelist (`exe`, `jpg.exe`, empty); a content type that doesn't start with `image/` — all before any signing call. |
| No caller paths | A smuggled `path` property in the upload options is ignored: the returned path is the server-built one, never the caller's. |

Not covered: the GCS module itself ([lib/gcs/idDocuments](../client/lib/gcs/idDocuments.ts)) — signing is faked here, so V4 signature mechanics, expiry seconds and bucket wiring are not asserted by this suite — and the components that call these actions.

### 3.19 [reactivation-email.test.ts](../client/__tests__/reactivation-email.test.ts) — the campaign's Unsubscribe link

**Subject:** the real token helpers from [lib/reactivationToken](../client/lib/reactivationToken.ts), the real `emailWrapper` from [lib/mail](../client/lib/mail.ts) (loaded with `vi.importActual`; nothing is sent), `sendReactivationEmails` from [lib/actions/adminParticipant](../client/lib/actions/adminParticipant.ts), and the GET/POST handlers of [/api/email-action/reactivate](../client/app/api/email-action/reactivate/route.ts). `@/lib/supabase/admin` is a builder that records every query, and `MAILING_ADDRESS` is a getter so each test can set it.

**Why this exists:** the reactivation ("are you still interested?") email is commercial email under CAN-SPAM, so it must say it is a solicitation, carry an unsubscribe link that keeps working for at least 30 days, and stop going to anyone who opted out. Unsubscribing sets `reactivation_status` to `no`, the same as answering No, and the send skips `no`.

| `describe` | Coverage |
|---|---|
| `unsubscribe token` | Round-trips participant and action; still valid 364 days later; a Yes token still expires after 30 days. |
| `emailWrapper footer` | With `unsubscribeUrl`: the solicitation line and the link. Without it (transactional email): neither. The postal address renders, HTML-escaped, once `MAILING_ADDRESS` is set. |
| `sendReactivationEmails` | Refuses anyone but an admin before any query or email; sends while `MAILING_ADDRESS` is still null; the participant query excludes `reactivation_status = 'no'`; every email gets an unsubscribe token signed for its own recipient. |
| `reactivate route` | Opening the Unsubscribe link only renders the button and runs no query, so a scanner that opens it can't unsubscribe anyone. The button's POST sets `reactivation_status = 'no'` whether it was `pending` or `yes` (`.neq("reactivation_status", "no")` keeps the first timestamp on a repeat), and the page says seats already accepted are not cancelled; a failed write names the support address; Yes, No and edit tokens and a tampered token are refused with 400. The No link is unchanged: a plain GET still moves a `pending` row to `no` (so a scanner opening it has the same effect as unsubscribing) and never overwrites an earlier answer. |

Not covered: the admin send-mail confirm page (a server component, which this suite doesn't render), and the real `sendReactivationEmail` template, which is mocked here, so the footer is pinned at `emailWrapper` and at the `unsubscribeUrl` the action passes.

### 3.20 [requestee-participant-access.test.ts](../client/__tests__/requestee-participant-access.test.ts) — what a law firm can see

**Subject:** the real [lib/participant/requesteeAccess](../client/lib/participant/requesteeAccess.ts) helpers, and the requestee entry points that use them: `getCaseParticipantNames`, `searchParticipantsForCase` and `requesteeAddParticipants` from [lib/actions/requesteeParticipant](../client/lib/actions/requesteeParticipant.ts), and the requestee branch of `getParticipantProfile` from [lib/participant/getParticipantProfile](../client/lib/participant/getParticipantProfile.ts). `@/lib/supabase/admin` and `@/lib/supabase/server` share one in-memory table store that applies `eq` / `in` / `is` / `not in` filters and logs, per client, every table it touches.

**Why this exists:** requestee logins can't read `jury_participants` or `oldData` in the database (`supabase/migrations/20261002_requestee_no_participant_access.sql`), so these helpers are the only way participant data reaches a firm, and they run with the service-role client. Privacy policy §6 promises firms never get a participant's phone, street address, date of birth, ID or PayPal username, and only see people on their own cases. Owning a case isn't enough to get in: the `cases` INSERT policies only check `auth.uid() = user_id`, so any login can create a case row of its own. Access is tied to sessions instead, which only admins attach to cases, and never to `roles`, which doesn't have a row for every user.

| `describe` | Coverage |
|---|---|
| `the fields a firm may see` | A profile has exactly `REQUESTEE_PROFILE_FIELDS` plus `age`, and none of 16 private columns (contact, address, county, date of birth, `dob`, ID, PayPal, blacklist, availability and more). Age comes from `date_of_birth`, oldData's `dob`, or its `age` column, and is null for a missing or bad date. A search result is id, name, city, age and political affiliation only. |
| `getCaseParticipantNames` | Names only, for people on the firm's own case, with legacy participants from `oldData`; anyone on another case and waitlisters are left out; a case the firm doesn't own is refused before any participant table is read; a case the firm is the assigned requestee on is accepted; a firm with no row in `roles` still gets names, and `roles` is never read; signed out is refused; a case with no session, such as one a participant created themselves, returns nobody without reading any participant table. |
| `getParticipantProfile for a firm` | A participant on the firm's case comes back without any private field, and the firm's own login never queries a participant table. A participant who isn't on that case is refused even with the firm's own case id (the old hole), as are a foreign case and a missing case id. |
| `searchParticipantsForCase` | Results carry only the six search fields; the firm's login never queries `jury_participants`; commas and brackets are stripped from the search text before it reaches the `.or()` filter; a foreign case is refused; a case with no session, such as one a participant created themselves, is refused before any participant table is read (the search reads the whole panel with the service role); a firm with no row in `roles` can search. |
| `requesteeAddParticipants` | A case with no session, such as one a participant created themselves, is refused before anything is invited, and so is a case the firm doesn't own. Past those checks it invites through `inviteToSession` ([lib/participant/invite](../client/lib/participant/invite.ts), mocked here), with the case's session, the ids and the session date: not through the `inviteParticipants` action, which since F28 refuses anyone but an admin. |

Not covered: the migration itself (no database in this suite; the SQL checks its own preconditions and rolls back if any requestee-readable policy remains), and the two client components, which only call `getCaseParticipantNames`.

### 3.21 [presenter-email.test.ts](../client/__tests__/presenter-email.test.ts) — escaping in the presenter email

**Subject:** the real `sendPresenterInfoEmail` from [lib/mail](../client/lib/mail.ts). Only the mailer request is intercepted (`fetch` is stubbed, `MAILER_URL` set, `getMailerAuthToken` mocked to `null`), so the HTML asserted is exactly what would be sent.

**Why this exists (F28):** the email goes to whatever address the admin types, and nearly everything in it comes from someone else: case titles, descriptions, file names and Drive links from the firm, the participants' profile answers. Drive links and every participant field used to go into the HTML raw, so a link like `https://x"><a href="https://evil.example">` became a working link of the firm's choosing in an email from support@.

| Case | Coverage |
|---|---|
| Escaping | A `<script>` title, an `<img onerror>` description, a quoted file name and markup in every participant field (email included) all arrive escaped; no raw `<script` or `<img` anywhere in the email. |
| Drive links | An https link stays a link, with `&` escaped in the `href`; a quote in a link can't close the `href` and open a link of its own; `javascript:`, `data:` and a scheme-less link are shown as escaped text, never as a link. |
| Document and Zoom links | An https Zoom link is linked with its `&` escaped; a `javascript:` document URL or Zoom link is never linked, and the file name or link is shown as escaped text. |

### 3.22 [require-admin.test.ts](../client/__tests__/require-admin.test.ts) — the two admin checks

**Subject:** `requireAdmin` and `requireAdminPage` from [lib/requireAdmin](../client/lib/requireAdmin.ts), with the server client and `next/navigation`'s `redirect` mocked.

**Why this exists (F28):** every admin server action starts with `requireAdmin()`, which throws, and every admin page with `requireAdminPage()`, which redirects. A page can't rely on `Admin/layout.tsx`: Next renders a page without its layout when an RSC request says the layout is already on screen.

| Case | Coverage |
|---|---|
| Admin | Both return the admin's id, reading only their own `roles` row. |
| Anyone else | `requireAdmin` throws "Not authorized" for a firm, participant, blacklisted login or one with no `roles` row, even with `user_metadata.role` set to admin, and "Not authenticated" signed out. `requireAdminPage` redirects the same callers to `/dashboard` and a signed-out visitor to `/auth/login`, before any `roles` read. |

### 3.23 [requestee-time-slots.test.ts](../client/__tests__/requestee-time-slots.test.ts) — the admin's open time slots

**Subject:** `planTimeSlots`, `findOverlappingSlot` and the calendar helpers in [lib/requesteeTimeSlots](../client/lib/requesteeTimeSlots.ts), and the real `createRequesteeTimeSlots` / `deleteRequesteeTimeSlot` actions with the server client mocked.

| Case | Coverage |
|---|---|
| Planning | Central Time becomes the right instants (CDT and CST); a weekly series keeps its wall-clock time across the November change; the note is trimmed; bad input, slots already started and times in the hour skipped in March are refused. |
| Overlaps | Partial and contained overlaps are found, slots that only touch are fine, and every week of a series is checked. |
| Calendar | Whole weeks Sunday to Saturday, months across a year end, only a real month in `?month=`, a late-evening slot filed under its Central date, plain spaces in times. |
| Actions | One row per week with the admin recorded; an overlap names the slot in the way and saves nothing; input is checked before any read; a failed overlap check saves nothing; a booked slot can't be deleted (it says to release the booking first); a non-uuid id is refused without a query. |

### 3.24 [slot-booking-rules.test.ts](../client/__tests__/slot-booking-rules.test.ts) — payment deadline and which slots a case can book

**Subject:** the pure rules in [lib/slotBooking](../client/lib/slotBooking.ts).

| Case | Coverage |
|---|---|
| Deadline | 24 working hours, Monday to Friday on the Central clock (Tue → Wed, Fri → Mon, a weekend booking → end of Monday), the wall-clock time kept across both clock changes. |
| Lead time | A slot must start 48 working hours ahead, so payment is due at least a working day before it. |
| Fit | A slot must be at least as long as the hours requested; empty or zero hours count as one, as pricing does. |
| State and labels | open, unpaid, overdue, paid and past; deadlines shown in Central Time; a firm named by its agreement, then its email. |

### 3.25 [admin-slot-booking.test.ts](../client/__tests__/admin-slot-booking.test.ts) — the admin's booking actions

**Subject:** the real actions in [lib/actions/adminSlotBooking](../client/lib/actions/adminSlotBooking.ts), over an in-memory database ([helpers/fakeSupabase](../client/__tests__/helpers/fakeSupabase.ts)) that enforces the table's keys.

| Case | Coverage |
|---|---|
| Who | Every action refuses a firm, a participant and a signed-out caller, writing nothing. |
| Payment | Mark paid (once) and unpaid. |
| Release | Not for non-payment before the deadline or on a paid booking; an overdue release stops the clock and tells the firm it can pick again; another reason keeps the clock; nothing changes if the booking moved since the page loaded; a failed firm email still succeeds, with a warning. |
| Move and assign | A move keeps the clock and any payment, and refuses another case's slot or the past. Booking for a firm refuses in-person and rejected cases and a case that already holds a slot, starts a new clock or reuses a running one, and never asks a paid firm to pay. |

### 3.26 [firm-slot-booking.test.ts](../client/__tests__/firm-slot-booking.test.ts) — a firm booking its time

**Subject:** the real actions in [lib/actions/requesteeSlotBooking](../client/lib/actions/requesteeSlotBooking.ts) over the same in-memory database, with `requireRequestee` reading `roles`.

| Case | Coverage |
|---|---|
| Who | Every action refuses participants, admins and signed-out callers, writing nothing. |
| Open times | Only free slots far enough ahead, with nothing about other firms. |
| Booking | Holds a free slot and starts the clock; another firm's case gets the same answer as a missing one; approved, rejected, archived and in-person cases, and slots too soon, too short or gone, are refused; losing a race says so; a switch keeps the clock and any payment; a re-book after a cancel keeps the clock. |
| Cancelling | Frees the slot and keeps the clock; refused for a paid time or an approved case. |

### 3.27 [case-booking-views.test.ts](../client/__tests__/case-booking-views.test.ts) — the booking boxes when a read fails

**Subject:** the async server components `CaseTimeSlotCard` (the firm's "Focus group time" box) and `CaseBookingPanel` (the admin case page's "Time slot" box), called directly and rendered with `renderToStaticMarkup`, and the Time Slots page. The booking reads, Supabase and the client controls are mocked.

| Case | Coverage |
|---|---|
| Firm's box | If the open times can't be read, the firm still sees the time it holds and its payment deadline, with a reload message instead of the controls, and the error is logged; "Pick one of our open times below" shows only when an open time fits the case (not when none was loaded, none is open, or none is long enough); with both reads working the controls show; if the booking itself can't be read, the box is left out. |
| Picker | With nothing that fits, it says so and gives info@; "or tell us your preferred timing below" only where the form asks for it (the new-case form), not on the case page. |
| Admin's box | A failed read of the booking's details is logged and named as such, not passed off as "the booking changed while the page loaded" (which still shows when the booking is really gone); if only the open times fail, the booking and its controls stay, the controls are told the open times couldn't be loaded (so the move list doesn't say there are none; the controls are mocked here, so their wording isn't checked), and with no booking the note replaces the book-a-time control; a failed case read is logged and shown, not silently dropped; every read working shows the booking and its controls; a failed first read points at the migrations. |
| Time Slots page | Checks for an admin (`requireAdminPage`) before any read. |

### 3.28 [central-time-displays.test.ts](../client/__tests__/central-time-displays.test.ts) — times on the admin and firm screens

**Subject:** the Central formatters in [lib/timezone](../client/lib/timezone.ts) (`formatSessionDate`, `formatCentralDateTime`, `formatCentralDate`, `formatCentralClock`, `centralDateTimeInput`, `centralDateTimeToISO`), `caseSessionTime` from [lib/case/caseSessionTime](../client/lib/case/caseSessionTime.ts), `deadlineForTimeframe` from [lib/case/deadline](../client/lib/case/deadline.ts), and the `CentralTimeRange` component. Every test runs in UTC, as the server does, unless it sets `process.env.TZ` to run as a browser or server in another zone would: on a machine set to Central Time, a formatter that lost its Central zone would otherwise still pass.

**Why this exists:** admin and firm screens formatted times in whatever zone the code ran in, with no label: UTC in server components (10 AM CT read 4:00 PM, and an evening time sat on the next day), the viewer's own zone in client ones. Admin inputs were read in the admin's browser zone, so an admin outside Texas stored times everyone was emailed hours off.

| `describe` | Coverage |
|---|---|
| `formatSessionDate` | Long and short forms; the same date in a Texas zone, where `new Date("2026-11-05")` gives Nov 4; text that isn't a date passes through. |
| Central formatting of stored instants | 10 AM CST shows as 10:00 AM CT from UTC, India and California; 7 PM CST stays on Nov 5; daylight saving time; an 11:59 PM CT deadline dates to its own day; unreadable values give null. |
| the firm's Central datetime-local field | Prefills on the Central clock from a UTC server, saves what it shows as Central, round-trips unchanged, and refuses partial or impossible values. |
| `caseSessionTime` | A case in a session runs from its own start (10-11 AM CST, not `admin_scheduled_at`'s 11 AM end); an evening case stays on its Central date; the session embed read as object or array, the latest session whichever order the rows come in; null without a date and start; no time text without an end. |
| `deadlineForTimeframe` | 11:59 PM Central that many days after today in Central, counted from the Central date in the evening and on the deadline's own offset across the November change; null for any other answer, including `constructor`. |
| `CentralTimeRange` | A case's times as "7:30 PM – 9:00 PM CT" for an admin in India (it showed 06:00 → 07:30); "Time unreadable" otherwise. |
| nothing reads the viewer's own time zone | Reads the source of `app/`, `lib/` and `components/` and fails on `resolvedOptions().timeZone` or `getTimezoneOffset(`. |

### 3.29 [session-date-emails.test.ts](../client/__tests__/session-date-emails.test.ts) — dates and times in the emails

**Subject:** the real templates in [lib/mail](../client/lib/mail.ts), with only the mailer request intercepted (as in §3.21).

| `describe` | Coverage |
|---|---|
| reschedule email | A participant gets the new date and time in the subject and body and "No action is required"; a firm gets each of its cases' times, titles escaped, and is asked to confirm on its dashboard when the action says the dashboard will ask (a reschedule resets its confirmation), and is told nothing is needed otherwise; one case's time is shown on its own, and with no session time the subject gives the date alone. |
| case titles in the firm's session emails | Escaped in Session Scheduled and Session Completed, which put them into the HTML as typed. |
| session dates in participant emails | The Zoom link, acceptance and called-in emails say "Thursday, November 5, 2026" in the subject and body, never "2026-11-05"; a date the caller already formatted is left as it is. |

### 3.30 [paid-time.test.ts](../client/__tests__/paid-time.test.ts) — a case runs no longer than its firm paid for

**Subject:** [lib/case/paidTime](../client/lib/case/paidTime.ts) and the Build Session time picker (`CaseTimeInputs`, rendered with `renderToStaticMarkup`). The server actions that use the rule are pinned in `sessions.test.ts` (§3.8).

| `describe` | Coverage |
|---|---|
| `paidMinutes`, `formatMinutes` | The hours asked for, or 1 hour when empty or 0, as the receipt prices it; lengths in words. |
| how long a case runs | From typed Central times ("HH:MM" only, as the writers convert, so seconds or spaces are refused before Build Session creates anything); past midnight; in real time on the nights the clocks change (1-3 AM on the spring-forward morning is 1 hour, 12:30-2:30 AM on the fall-back morning is 3); 0 for an end at the start; null for an unreadable time; from stored UTC times on the session's date. |
| `paidTimeProblem` | Up to the paid length is fine; longer is refused with what was paid for; a longer length a case already had may stay but not grow; nothing, or unreadable, is refused; `assertPaidTime` throws the same message. |
| Build Session's end times | Every half hour up to the paid length, ending on it when it isn't a whole half hour, wrapping past midnight; none until there is a start; the picker starts closed and says what the case is paid for. |

Not covered: the Reschedule and Replace Case dialogs (both closed until clicked, and Reschedule needs the router), and Build Session's own check before it creates the session, which is an inline action on the page; each uses the functions above, and the actions behind them are pinned in `sessions.test.ts`.

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
- Admin actions start with `requireAdmin()`, which reads the caller's `roles` row with `.maybeSingle()`. In [cases.test.ts](../client/__tests__/cases.test.ts) and [sessions.test.ts](../client/__tests__/sessions.test.ts) that read is answered from a `role` / `callerRole` field instead of the queue, so set the caller (`asAdmin()`) rather than queueing a roles response. Every admin action needs a refusal test: a non-admin and a signed-out caller, with nothing but the `roles` row touched and no email.
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

### 4.5 GCS id-documents module mock

The `id-documents` storage seam is **no longer the Supabase admin client**: [id-photos.test.ts](../client/__tests__/id-photos.test.ts), [underage-account.test.ts](../client/__tests__/underage-account.test.ts) and [id-photo-urls.test.ts](../client/__tests__/id-photo-urls.test.ts) mock the whole GCS module instead (the `case-documents` bucket is still Supabase Storage, so [documents-drive-links.test.ts](../client/__tests__/documents-drive-links.test.ts) keeps its §4.1-style `storage.from(bucket)` facade):

```ts
vi.mock("@/lib/gcs/idDocuments", () => ({
  listIdPhotos: vi.fn(async (userId) => { log.push(`list ${userId}`); return state.files; }),
  removeIdPhotos: vi.fn(async (paths) => { if (paths.length > 0) log.push(`remove ${paths.join(",")}`); }),
  createReadUrl: vi.fn(async (path) => { log.push(`readUrl ${path}`); return `https://signed.example/read/${path}`; }),
  createUploadUrl: vi.fn(async (path, contentType) => { log.push(`uploadUrl ${path} ${contentType}`); return `https://signed.example/upload/${path}`; }),
}));
```

Three rules keep these mocks honest. The factory exports **all four** functions, whichever subset the action under test imports, so a new import never fails at module load. The fakes **throw** to simulate a storage failure (`state.listError` / `state.removeError`) — the real module throws rather than returning `{ error }` the way the Supabase client did, and the actions are expected to swallow. And because the module is replaced wholesale, no test ever constructs a GCS client, so the suite needs none of the `GCS_*` env vars and the module's lazy construction is never exercised here. Listing entries are `{ path, size, createdAt }` objects carrying full bucket-relative paths (`p-1/100-id.jpg`) — there is no Supabase-style folder entry or `id: null` quirk — and an empty `removeIdPhotos([])` is a no-op by contract, so the mocks log only non-empty removes.

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
- **No interactive rendering.** UI behavior (toast messages, button disabled states, optimistic updates) is not covered. Only §3.27 renders React, as static HTML from server components. The closest proxy is the rendered HTML assertion in `email-action.test.ts`.
- **`zip-lookup.test.ts` calls the public internet.** It will fail in offline / firewalled environments. There is a 15-second per-test timeout; if the upstream becomes unreliable, mock `global.fetch` (the existing "County lookup failure" test shows the pattern).
- **`participants.test.ts` and `match-participant-to-filter.test.ts` are placeholders.** They contribute zero regression coverage today and exist only as a contract for future work.
- **Secret scanning runs against full history (`fetch-depth: 0`).** A new gitleaks rule will flag historical leaks; you cannot ignore them by only sanitizing `HEAD`.
