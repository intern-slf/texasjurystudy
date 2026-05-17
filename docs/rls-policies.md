# Supabase RLS Audit

**Project:** Texas Jury Study
**Audit started:** 2026-05-16
**Status:** 🟩 RLS enabled on all tables (2026-05-17) — open items are policy refinements, not gaps

---

## Critical findings (resolved 2026-05-17)

All four previously UNRESTRICTED tables now have RLS enabled and policies attached:

| Table | Status | Closing change |
|---|---|---|
| `sessions` | 🟩 RLS enabled | F1 closed — admin FOR ALL + scoped presenter/participant SELECTs |
| `session_cases` | 🟩 RLS enabled | F2 closed — admin FOR ALL + presenter SELECT scoped to own cases |
| `session_participants` | 🟩 RLS enabled | F3 closed — admin FOR ALL + scoped participant/presenter access |
| `oldData` | 🟩 RLS enabled | F4 closed — admin + presenter SELECT, no write policies (writes blocked) |

Remaining work is policy refinement (see Findings table at bottom): scope-tightening on `jury_participants` (F14), column-scoping `session_participants` UPDATE (F19), duplicate-policy cleanup (F17/F22), data-model confirmations (F16, F18, F20), and **F21 (new, HIGH) — `case_drive_links` exposes every case's Google Drive URLs to all authenticated users.**

---

## Authorization model (how the app currently gates access)

Important context before reading the per-table sections:

1. **Two Supabase clients are used in the codebase:**
   - `client/lib/supabase/server.ts` and `client/lib/supabase/client.ts` use the **anon key** — RLS applies to every query they make. This is what runs in server components, pages, and the browser.
   - `client/lib/supabase/admin.ts` uses the **service_role key** — bypasses RLS entirely. Used for signup, auto-blacklist, admin user creation.
2. **Roles live in `public.roles`** (not in JWT claims). Every page/server-action that needs to check "is this user an admin?" does an extra `SELECT role FROM roles WHERE user_id = auth.uid()`. Examples: `client/app/dashboard/Admin/layout.tsx:26`, `client/app/dashboard/router.tsx:20`, `client/components/login-form.tsx:47`.
3. Possible role values seen in code: `admin`, `participant`, `presenter`, `blacklisted`.
4. **The middleware** (`client/lib/supabase/proxy.ts:47`) only checks "is the user logged in" — it does **not** enforce role-based routing. Role checks happen in individual page files.
5. **Consequence:** Most "admin" server actions in `client/lib/actions/session.ts` call `createClient()` (anon) — they only work because the underlying tables currently have no RLS to block them. Once RLS is added, either (a) the policies must allow admins via a role check, or (b) those actions must switch to `supabaseAdmin`.

### Recommended helper SQL function

Most admin/presenter/participant policies will need to check the user's role. Define this once and reuse:

```sql
-- run in Supabase SQL editor
create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.roles where user_id = auth.uid() limit 1;
$$;

revoke all on function public.user_role() from anon, authenticated;
grant execute on function public.user_role() to authenticated;
```

Then policies can do `using (public.user_role() = 'admin')` etc.

> **Why `security definer`:** so the function can read `roles` even when a calling user has no SELECT policy on `roles`. Without this, the role check itself would be blocked by RLS.

---

## Per-table audit

For each table: current policy state (to be filled by the intern from the Supabase dashboard), code access patterns (already found), recommended policy.

### 🟩 `sessions` — RLS enabled (2026-05-17)

**Code access:**
- Admin: full CRUD via `client/lib/actions/session.ts` (insert at L28, update at L353, L749, L906; delete at L582, L607, L625, L672, L691)
- Cron: read + update via `client/app/api/cron/session-completion/route.ts:20,27,118` (this route uses `supabaseAdmin` — bypasses RLS, so cron is fine regardless)
- Participant: read own sessions via `client/lib/participant/updateInviteStatus.ts:11,87,198,230,289` and `client/app/dashboard/participant/sessions/page.tsx` (via join through `session_participants`)
- Presenter: read sessions they're attached to via `client/lib/actions/presenterParticipant.ts:163,189`

**Recommended policy:**
- Enable RLS.
- `SELECT`: admin (all rows), or any authenticated user whose `user_id` appears in `session_participants` for that `session_id`, or presenters attached via `session_cases`.
- `INSERT` / `UPDATE` / `DELETE`: admin only.
- Cron route already uses service_role — unaffected.

Existing admin server actions in `session.ts` currently use the anon client. **They will break once RLS is on** unless either (a) the admin SELECT/INSERT/UPDATE/DELETE policies above are added, or (b) the actions are switched to `supabaseAdmin`. Recommend option (a) — it's the safer pattern (one source of truth for admin permission, and audit-able in Postgres).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| admin can manage sessions | ALL | authenticated | `is_admin()` | `is_admin()` |
| participant can read own sessions | SELECT | authenticated | `EXISTS (session_participants sp WHERE sp.session_id = sessions.id AND sp.participant_id = auth.uid())` | — |
| presenter can read own sessions | SELECT | authenticated | `EXISTS (session_cases sc JOIN cases c WHERE sc.session_id = sessions.id AND (c.user_id = auth.uid() OR c.presenter_id = auth.uid()))` | — |

Matches recommendation. Admin go-through-anon works via `is_admin()`. Presenter check correctly handles both `c.user_id` and `c.presenter_id` (the only table that does — see F16).

---

### 🟩 `session_cases` — RLS enabled (2026-05-17)

**Code access:**
- Admin: full CRUD in `client/lib/actions/session.ts` (insert L60, delete L366, L518, L540, L634, L701, L769, L782, L919)
- Read-only for participants/presenters via various dashboards (`client/app/dashboard/presenter/[caseId]/page.tsx:61`, `client/components/PresenterParticipantHistory.tsx:95`, `client/components/CaseParticipantSummary.tsx:33`)
- Cron: read via `client/app/api/cron/session-completion/route.ts:48` (service_role — unaffected)

**Recommended policy:**
- Enable RLS.
- `SELECT`: admin OR any auth user (this is a join table — restricting reads gets messy and the columns aren't sensitive). Reconsider if `session_cases` ever holds confidential per-case-per-session data.
- `INSERT` / `UPDATE` / `DELETE`: admin only.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| admin can manage session_cases | ALL | authenticated | `is_admin()` | `is_admin()` |
| presenter can read session_cases of own cases | SELECT | authenticated | `EXISTS (cases c WHERE c.id = session_cases.case_id AND (c.user_id = auth.uid() OR c.presenter_id = auth.uid()))` | — |

Matches recommendation. No general-authenticated SELECT — narrower than the "any auth user can read" option from the recommendation, which is fine (presenter scope covers the actual reads).

---

### 🟩 `session_participants` — RLS enabled (2026-05-17)

**This is the most participant-PII-sensitive table that got newly enabled.** See F19 (open) — participant UPDATE policy is not yet column-scoped.

**Code access:**
- Admin: full CRUD in `client/lib/actions/session.ts` (L118, L398, L455, L477, L723, L833, L965)
- Participant (self): read+update via `client/lib/participant/updateInviteStatus.ts:19,36,65,210,219,278` (this is the RSVP flow) and `client/app/api/email-action/route.ts:36`
- Participant reading invites: `client/lib/participant/getPendingInvites.ts:10`, `client/app/dashboard/participant/sessions/page.tsx:41`
- Presenter: `client/lib/actions/presenterParticipant.ts:49,196` (reads participants assigned to their cases)

**Recommended policy:**
- Enable RLS.
- `SELECT`:
  - Admin: all rows.
  - Participant: only rows where `participant_user_id = auth.uid()` (confirm actual column name).
  - Presenter: only rows where the row's `session_id` is joined via `session_cases` to a case whose `presenter_user_id = auth.uid()`. *This may require a `security definer` view or function.*
- `UPDATE`:
  - Admin: all columns.
  - Participant: own row only, and only specific columns (`accepted`, maybe `response_at`). NOT `is_blacklisted` or any admin-controlled field.
- `INSERT` / `DELETE`: admin only.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| admin can manage session_participants | ALL | authenticated | `is_admin()` | `is_admin()` |
| participants can read own session invites | SELECT | public | `participant_id = auth.uid()` | — |
| presenter can read session participants of own cases | SELECT | public | `EXISTS (session_cases sc JOIN cases c WHERE sc.session_id = session_participants.session_id AND c.user_id = auth.uid())` | — |
| participants can update own invite | UPDATE | public | `participant_id = auth.uid()` | `participant_id = auth.uid()` |

**Diffs from recommendation:**
- Presenter SELECT keys only on `c.user_id`, not `c.presenter_id` — same gap as F16. Presenters who didn't *create* the case can't see participants.
- Participant UPDATE is row-scoped but not column-scoped — see F19 (participant could rewrite `session_id`, `participant_id`, etc.).

---

### 🟩 `oldData` — RLS enabled (2026-05-17)

**Code access:** read-only from many places (`client/lib/case-lineage.ts`, `client/components/{CaseParticipantSummary,PresenterParticipantHistory,PreviousParticipantsModal,SelectAllParticipants}.tsx`, `client/app/dashboard/Admin/sessions/page.tsx:255`). Writes only in `client/lib/actions/session.ts:499,1016` and `client/lib/participant/updateInviteStatus.ts:261`.

**Confirmed live (2026-05-16):** Despite the name, `oldData` is actively used as a fallback store for legacy participants. The app falls back to it whenever a participant lookup misses in `jury_participants`. Used in `client/lib/case-lineage.ts`, `client/lib/actions/session.ts`, `client/lib/participant/getParticipantProfile.ts`, `client/components/{CaseParticipantSummary,PresenterParticipantHistory,PreviousParticipantsModal,SelectAllParticipants}.tsx`, and admin/participant pages via `?test_table=oldData` URL params. **Not a deletion candidate.** Needs RLS turned on.

**Recommended policy:**
- Enable RLS.
- `SELECT`: admin + presenter (used in presenter participant-history view). If the table contains PII, restrict presenter SELECT to participants attached to that presenter's cases via the same join used for `jury_participants`.
- `INSERT` / `UPDATE` / `DELETE`: admin only.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| admin can read all oldData | SELECT | authenticated | `is_admin()` | — |
| presenter can read oldData | SELECT | authenticated | `EXISTS (roles WHERE roles.user_id = auth.uid() AND roles.role = 'presenter')` | — |

No INSERT/UPDATE/DELETE policies → writes blocked for anon/authenticated (correct; no code writes here).

**Diff from recommendation:** Presenter SELECT is unscoped — *any* presenter can read all of `oldData`, not just rows tied to their own cases. Deferred per F4 (would require a join through `session_cases`/`cases` and may need a `security definer` view).

---

### 🟩 `roles` — RLS enabled (per dashboard globe icon)

**This is the most important table to lock down correctly.** If a participant can write to `roles`, they can promote themselves to admin and bypass every other policy.

**Code access:**
- Read (any user, their own row): `client/app/dashboard/router.tsx:20`, `client/components/login-form.tsx:47`, `client/app/dashboard/Admin/layout.tsx:27`, `client/lib/participant/getParticipantProfile.ts:23`, plus many admin pages joining roles for displays.
- Write — **only via `supabaseAdmin`** (service_role): `client/app/auth/actions.ts:30` (signup), `client/lib/actions/autoBlacklist.ts:29,50,58`, `client/lib/actions/adminParticipant.ts:63,89`. Good — no anon-key writes anywhere.

**Recommended policy:**
- `SELECT`: any authenticated user, but only for `user_id = auth.uid()`. Admins may read all rows (used by admin dashboards joining roles).
- `INSERT` / `UPDATE` / `DELETE`: **deny all roles including authenticated** (`using (false)`). All writes go through `supabaseAdmin` via server actions.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| Users can read own role | SELECT | authenticated | `auth.uid() = user_id` | — |
| Users can view own role | SELECT | public | `auth.uid() = user_id` | — |
| admin can read all roles | SELECT | authenticated | `is_admin()` | — |

✅ Matches recommendation. **No INSERT/UPDATE/DELETE policies** → all writes blocked for anon/authenticated (only `supabaseAdmin` can write). This is the correct shape — the F5 "service role manages all" hole is properly closed.

**Cleanup:** "Users can read own role" + "Users can view own role" are duplicates (F17).

---

### 🟩 `cases` — RLS enabled

**Code access:** admin pages list and edit, presenters read their own approved cases. Inserts via `client/lib/actions/adminCase.ts` (need to confirm). Read in `client/app/dashboard/Admin/layout.tsx:42`.

**Recommended policy:**
- `SELECT`: admin (all), presenter (only `presenter_user_id = auth.uid()`).
- `INSERT` / `UPDATE` / `DELETE`: admin only.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| user can delete own cases | DELETE | public | `auth.uid() = user_id` | — |
| user can delete own previous cases | DELETE | public | `auth.uid() = user_id AND status = 'previous'` | — |
| Allow authenticated insert | INSERT | authenticated | — | `auth.uid() = user_id` |
| Users can create their own cases | INSERT | authenticated | — | `auth.uid() = user_id` |
| presenter can create case | INSERT | authenticated | — | `auth.uid() = user_id` |
| user can insert own cases | INSERT | public | — | `auth.uid() = user_id` |
| Allow individual select | SELECT | authenticated | `auth.uid() = user_id` | — |
| Users can view their own cases | SELECT | authenticated | `auth.uid() = user_id` | — |
| admin can read all cases | SELECT | public | `is_admin` (EXISTS roles) | — |
| admin read cases | SELECT | public | `is_admin` (EXISTS roles) | — |
| presenter can read own cases | SELECT | authenticated | `auth.uid() = user_id` | — |
| user can read own cases | SELECT | public | `auth.uid() = user_id` | — |
| admin can update cases | UPDATE | authenticated | `is_admin` (EXISTS roles) | `is_admin` (EXISTS roles) |
| user can soft update own cases | UPDATE | public | `auth.uid() = user_id` | — |
| user can update own cases | UPDATE | public | `auth.uid() = user_id` | — |

**Diffs from recommendation:**
- 4 redundant INSERT policies (all same WITH CHECK) — F17.
- 2 redundant admin SELECT policies + 2 redundant "own row" SELECT policies — F17.
- 2 redundant UPDATE policies for own row — F17.
- Presenter SELECT keys on `user_id` only, not `presenter_id` — F16 (presenter assigned by admin to a case they didn't create can't see it).

---

### 🟩 `case_documents` — RLS enabled

**Code access:** uploaded files attached to cases. Read by presenters and admins.

**Recommended policy:** same shape as `cases` — readable by admin + the case's presenter; writable by admin (or whoever owns the document upload — confirm flow).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| Allow users to delete their own documents | DELETE | authenticated | `auth.uid() = uploaded_by` | — |
| users can insert own case documents | INSERT | authenticated | — | `uploaded_by = auth.uid()` |
| Allow users to view their own documents | SELECT | authenticated | `auth.uid() = uploaded_by` | — |
| admin can read all case documents | SELECT | public | `is_admin` (EXISTS roles) | — |
| admin read case documents | SELECT | public | `is_admin` (EXISTS roles) | — |

**Diffs from recommendation:**
- 2 redundant admin SELECT policies — F17.
- Owner-based scoping (`uploaded_by`) instead of case-based — fine in practice as long as presenters only upload to their own cases.
- No admin UPDATE/DELETE policies → admin edits/deletes go through `supabaseAdmin` only.

---

### 🟩 `case_drive_links` — RLS enabled

**Code access:** Google Drive URLs attached to cases.

**Recommended policy:** same shape as `cases`.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| Presenter manages own drive links | ALL | authenticated | `uploaded_by = auth.uid()` | `uploaded_by = auth.uid()` |
| Authenticated users can view drive links | SELECT | authenticated | `true` | — |

**Diff from recommendation:** 🟥 **NEW FINDING — see F21.** The "Authenticated users can view drive links" SELECT policy has `USING (true)` — any authenticated user can read every case's Google Drive URLs. Presenters' confidential case material exposed to participants. Drop this policy; the per-owner `ALL` policy already covers the legit read path. Admins/other presenters reading via cases dashboard should go through a case-scoped SELECT instead.

---

### 🟩 `case_audit_logs` — RLS enabled

**Code access:** writes from `client/app/dashboard/presenter/page.tsx:155,181,205` (presenter activity logging) using the anon-key server client.

**Recommended policy:**
- `INSERT`: any authenticated user (they're logging their own action), with a `WITH CHECK` clause forcing `actor_user_id = auth.uid()`.
- `SELECT`: admin only.
- `UPDATE` / `DELETE`: nobody (logs are append-only).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| system can insert audit logs | INSERT | public | — | `auth.uid() = user_id` |
| user can read own audit logs | SELECT | public | `auth.uid() = user_id` | — |

**Diff from recommendation:** SELECT is self-scoped only — no admin SELECT policy (admins must read via `supabaseAdmin`). No UPDATE/DELETE policies → correctly append-only. Matches F7's "acceptable for now" judgment.

---

### 🟩 `confidentiality_agreements` — RLS enabled

**Code access:** read in `client/app/dashboard/page.tsx:137`; written in `client/components/ParticipantForm.tsx:109` (participant signing the agreement, from the browser using anon key).

**Recommended policy:**
- `SELECT`: admin (all), participant (only their own row).
- `INSERT`: participant, with `WITH CHECK (user_id = auth.uid())`.
- `UPDATE` / `DELETE`: admin only (agreements should be immutable after signing).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| participant can insert own agreement | INSERT | public | — | `auth.uid() = user_id` |
| users can insert own agreement | INSERT | public | — | `auth.uid() = user_id` |
| participant can read own agreement | SELECT | public | `auth.uid() = user_id` | — |
| users can read own agreement | SELECT | public | `auth.uid() = user_id` | — |

**Diffs from recommendation:**
- 2 duplicate INSERT + 2 duplicate SELECT policies — F17.
- No admin SELECT (admins read via `supabaseAdmin` only). Confirm `client/app/dashboard/page.tsx:137` works — that path uses anon client, so admin-on-other-participants reads will fail.
- No UPDATE/DELETE policies → correctly immutable for authenticated, admin edits via `supabaseAdmin` only.

---

### 🟩 `confidentiality_agreements_presenter` — RLS enabled

Confirmed full name. Presenter-side version of `confidentiality_agreements`.

**Code access:**
- Read: `client/app/dashboard/page.tsx:73,74,124` (presenter dashboard checks if presenter has signed) and `client/app/dashboard/Admin/[caseId]/page.tsx:128` (admin reads via `supabaseAdmin`).
- Write: not found in codebase yet — presenter signing flow may write here, double-check the relevant form component.

**Recommended policy:**
- `SELECT`: admin (all), presenter (only their own row).
- `INSERT`: presenter, with `WITH CHECK (user_id = auth.uid())`.
- `UPDATE` / `DELETE`: admin only (immutable after signing).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| presenter can insert own agreement | INSERT | public | — | `auth.uid() = user_id` |
| presenter can read own agreement | SELECT | public | `auth.uid() = user_id` | — |

**Diffs from recommendation:**
- No admin SELECT (admins must read via `supabaseAdmin`). `client/app/dashboard/Admin/[caseId]/page.tsx:128` already uses `supabaseAdmin`, so that path is fine. But `client/app/dashboard/page.tsx:73,74,124` uses anon — confirm those only read own row.
- No UPDATE/DELETE policies → correctly immutable.

---

### 🟩 `jury_participants` — RLS enabled

**Most sensitive PII table in the system** (demographics, employment, contact info).

**Code access:**
- Admin pages: full read/edit (sidebar counts at `client/app/dashboard/Admin/layout.tsx:53,59`, many list pages).
- Participant: read/write own row (profile form).
- Write via `supabaseAdmin` in `client/lib/actions/autoBlacklist.ts:34` (blacklist updates).

**Recommended policy:**
- `SELECT`: admin (all), presenter (only participants assigned to their sessions — same join as `session_participants`), participant (own row only).
- `INSERT`: participant (own row only, `WITH CHECK (user_id = auth.uid())`).
- `UPDATE`: admin (all), participant (own row, only profile fields — NOT `approved_by_admin`, `blacklisted_at`, `blacklist_reason`).
- `DELETE`: admin only.

This is the table where column-level policies matter most. Recommend documenting which columns participants can self-edit vs. which are admin-only.

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| Users can insert own participant profile | INSERT | public | — | `auth.uid() = user_id` |
| Users can insert their own participant profile | INSERT | public | — | `auth.uid() = user_id` |
| Presenters can view participants in their sessions | SELECT | public | `auth.uid() = user_id OR is_admin OR EXISTS (session_participants sp JOIN session_cases sc JOIN cases c WHERE sp.participant_id = jury_participants.user_id AND (c.user_id = auth.uid() OR c.presenter_id = auth.uid()))` | — |
| Users can view their own participant profile | SELECT | public | `auth.uid() = user_id` | — |
| admin read jury participants | SELECT | public | `is_admin` (EXISTS roles) | — |
| presenter can read jury participants | SELECT | public | `EXISTS (roles WHERE roles.user_id = auth.uid() AND roles.role IN ('presenter','reviewer'))` | — |
| Users can update their own participant profile | UPDATE | public | `auth.uid() = user_id` | — |

**Diffs from recommendation:**
- 🟥 "presenter can read jury participants" allows ANY presenter/reviewer to read ALL participants — confirms F14. The correctly-scoped policy already exists ("Presenters can view participants in their sessions"), so the broad one is pure shadowing. **Drop the broad one.**
- 2 duplicate INSERT policies — F17.
- UPDATE allows participant to write any column of their own row — no column-level grant. Recommendation called for blocking `approved_by_admin`, `blacklisted_at`, `blacklist_reason`. Open follow-up.
- No DELETE policy → admin deletes via `supabaseAdmin` only.
- `reviewer` role appears in policy but not in `roles.role` CHECK constraint — F18.

---

### ⬛ `presenter_responses` — DROPPED (2026-05-16)

Confirmed unused (0 code references, 0 rows, no FKs/functions/views depending on it). Dropped via `DROP TABLE public.presenter_responses` in Supabase SQL Editor on 2026-05-16. Verified absent from `information_schema.tables` post-drop.

---

### 🟩 `profiles` — RLS enabled

Standard Supabase `profiles` table.

**Code access:**
- `client/app/dashboard/Admin/[caseId]/page.tsx:127` — admin reads presenter's profile (via `supabaseAdmin`, service_role).
- `client/lib/actions/adminCase.ts:41,94` — admin reads presenter profiles (need to confirm client used).

**Recommended policy:**
- `SELECT`: admin (all), self (own row).
- `UPDATE`: self (own row).
- `INSERT`: handled by a trigger on `auth.users` typically — confirm.
- `DELETE`: nobody (cascade from auth.users).

**Current dashboard policies (2026-05-17):**

| Policy | Cmd | Role | USING | WITH CHECK |
|---|---|---|---|---|
| Users can insert own profile | INSERT | public | — | `auth.uid() = id` |
| Users can read own profile | SELECT | public | `auth.uid() = id` | — |
| presenter can read participants of own cases | SELECT | public | `EXISTS (session_participants sp JOIN session_cases sc JOIN cases c WHERE sp.participant_id = profiles.id AND c.user_id = auth.uid())` | — |
| Users can update own profile | UPDATE | public | `auth.uid() = id` | — |

**Diffs from recommendation:**
- Column is `id`, not `user_id` (Supabase default — confirm).
- Presenter SELECT keys only on `c.user_id`, not `c.presenter_id` — F16 (admin-assigned presenters locked out).
- No admin SELECT/UPDATE policies → admin reads go through `supabaseAdmin` (matches `client/app/dashboard/Admin/[caseId]/page.tsx:127`).
- No DELETE policy → correctly nobody (cascade only).
- F20 still open: `profiles` table is empty; missing `handle_new_user()` trigger.

---

### ⬛ `transcript_orders` — DROPPED (2026-05-16)

Confirmed unused (0 code references, 0 rows, no FKs/functions/views depending on it). Dropped via `DROP TABLE public.transcript_orders` in Supabase SQL Editor on 2026-05-16. Verified absent from `information_schema.tables` post-drop.

---

## Findings & action items

| # | Severity | Item | Owner | Status |
|---|---|---|---|---|
| F1 | ✅ CLOSED | `sessions` RLS enabled 2026-05-17. Dropped three duplicate over-broad INSERT policies (all `WITH CHECK true`). Added admin FOR ALL via `is_admin()` + presenter SELECT scoped to sessions involving their own cases (join via `session_cases` → `cases`) + participant SELECT scoped to sessions they're invited to (via `session_participants`). Cron unaffected (uses supabaseAdmin). | | Closed |
| F2 | ✅ CLOSED | `session_cases` RLS enabled 2026-05-17. Dropped over-broad "allow authenticated insert" (WITH CHECK true). Added admin FOR ALL via `is_admin()` + presenter SELECT scoped to own cases (`c.user_id = auth.uid() OR c.presenter_id = auth.uid()`). No participant policy needed — invite flow uses supabaseAdmin. | | Closed |
| F3 | ✅ CLOSED | `session_participants` RLS enabled 2026-05-17. Dropped broken "admin can insert session invites" (referenced empty `profiles.role`) + duplicate participant UPDATE policy. Added admin FOR ALL via `is_admin()`. Kept existing participant read/update own + presenter read for own cases. | | Closed |
| F4 | ✅ CLOSED | `oldData` RLS enabled 2026-05-17. Added admin SELECT (via `is_admin()`) + presenter SELECT (role-scoped). No INSERT/UPDATE/DELETE policies → writes blocked for anon/authenticated (no code writes to this table anyway). Per-case presenter scoping deferred — see audit notes. | | Closed |
| F5 | ✅ CLOSED | `roles` "Service role manages all" (`USING true, WITH CHECK true, TO public`) — allowed any auth user to UPDATE their own role to 'admin'. Dropped + replaced with "admin can read all roles" SELECT policy. (2026-05-16) | | Closed |
| F6 | ✅ CLOSED | `jury_participants` "Allow authenticated update participant" (`USING true`) — allowed any auth user to tamper with any participant's `approved_by_admin`, `blacklist_reason`, demographics. Dropped. (2026-05-16) | | Closed |
| F7 | 🟨 MED | Verify `case_audit_logs` "system can insert audit logs" `WITH CHECK (auth.uid() = user_id)` — already correct, but anyone can self-log; not a real issue. SELECT also `auth.uid() = user_id` — admin can't read others' logs via anon (they'd need supabaseAdmin). Acceptable for now. | | Closed |
| F8a | ✅ CLOSED | `presenter_responses` dropped 2026-05-16 (0 rows, no dependencies) | | Closed |
| F8b | ✅ CLOSED | `transcript_orders` dropped 2026-05-16 (0 rows, no dependencies) | | Closed |
| F8c | ✅ CLOSED | Truncated table name is `confidentiality_agreements_presenter` — active, used in presenter dashboard | | Closed |
| F9 | ⬜ INFO | Decide policy: should admin server actions in `lib/actions/session.ts` use `supabaseAdmin` (service-role bypass) or be allowed via RLS admin policies? Recommend the latter | | Open |
| F10 | ⬜ INFO | Run `supabase db pull` from repo root to commit schema + policies under `supabase/migrations/` | | Open |
| F11 | ✅ CLOSED | `cases` "Allow admins to update case status" (`USING true, WITH CHECK true`) had NO admin check — allowed any auth user to UPDATE any case (reassign presenters, flip admin_status). Dropped + replaced with real admin-role-check policy. (2026-05-16) | | Closed |
| F12 | ✅ CLOSED | `cases` "Allow authenticated inserts" (`WITH CHECK true`) — allowed any auth user to insert cases as someone else. Dropped (four other INSERT policies on `cases` correctly enforce `auth.uid() = user_id`). (2026-05-16) | | Closed |
| F13 | ✅ CLOSED | `case_documents` "Allow authenticated inserts" (`WITH CHECK true`) — allowed any auth user to upload documents attributed to anyone. Dropped + replaced with `WITH CHECK (uploaded_by = auth.uid())`. (2026-05-16) | | Closed |
| F14 | 🟨 MED | `jury_participants` "presenter can read jury participants" allows ALL presenters/reviewers to read ALL participants (not just their own sessions). Shadows the correct, scoped "Presenters can view participants in their sessions" policy. Drop the broad one. | | Open |
| F15 | ✅ CLOSED | Resolved as part of F3. Dropped the broken `profiles.role` policy and replaced with `is_admin()`-based admin FOR ALL policy on `session_participants`. (2026-05-17) | | Closed |
| F16 | 🟨 MED | `cases` has both `user_id` and `presenter_id` columns; all existing policies key on `user_id`. If an admin ever assigns a case to a presenter who didn't create it, that presenter is locked out. Confirm data-model intent. | | Open |
| F17 | 🟨 MED | Duplicate-policy cleanup needed: `cases` (16 policies, ~10 redundant), `confidentiality_agreements` (2 dup INSERT + 2 dup SELECT), `jury_participants` (dup INSERT, dup UPDATE), `session_participants` (dup UPDATE), `sessions` (3 dup INSERT), `roles` (1 dup SELECT). | | Open |
| F18 | ⬜ INFO | `reviewer` role appears in `jury_participants` "presenter can read" policy but doesn't exist in `roles.role` CHECK constraint (only allows `participant`, `presenter`, `admin`, `blacklisted`). Dead or planned role — confirm. | | Open |
| F19 | 🟨 MED | `session_participants` "participants can update own invite" allows UPDATE on *all* columns of own row, not just `invite_status`/`responded_at`. A participant could change `session_id` on their own row from devtools (realistic exploit small — they'd need a valid session UUID). Fix later with column-level grants. | | Open |
| F20 | ⬜ INFO | `public.profiles` table is empty — likely missing the standard Supabase `handle_new_user()` trigger that auto-creates a profile row when an `auth.users` row is inserted. Code in `adminCase.ts:41,94` and `Admin/[caseId]/page.tsx:127` reads profiles for presenter info but currently returns empty. Not breaking anything today. Future cleanup: add the trigger + backfill. | | Open |
| F21 | 🟥 HIGH | `case_drive_links` "Authenticated users can view drive links" has `USING (true)` — any authenticated user (incl. participants) can read every case's Google Drive URLs. Drop this policy; the per-owner `ALL` policy already covers the legit presenter read. Add an admin SELECT + a case-scoped presenter SELECT if cross-presenter reads are needed. (Found 2026-05-17 during dashboard policy dump.) | | Open |
| F22 | 🟨 MED | Audit dump (2026-05-17) confirmed F17 duplicates concretely: `cases` has 4 dup INSERTs + 2 dup admin SELECT + 2 dup own-row SELECT + 2 dup own-row UPDATE; `case_documents` has 2 dup admin SELECT; `confidentiality_agreements` has 2 dup INSERT + 2 dup SELECT; `jury_participants` has 2 dup INSERT; `roles` has 2 dup own-row SELECT. Drop the older/redundant duplicates in a single cleanup pass. | | Open |

---

## Next steps (this week)

1. **Patch the 4 unrestricted tables first.** For each:
   - Add `public.user_role()` helper function above (one-time).
   - Enable RLS.
   - Apply the recommended policies above.
   - Smoke-test the corresponding flow end-to-end **before deploying** (admin creates a session, participant accepts an invite, presenter views their case, cron runs).
2. **Paste current policies** for every RLS-enabled table into this doc's `_TBD_` slots so we have a baseline. Compare against the "Recommended policy" section.
3. **Drop unused tables** — run the pre-flight check + `DROP TABLE` for `presenter_responses` and `transcript_orders` (decision logged 2026-05-16).
4. Run `supabase db pull` and commit the resulting SQL under `supabase/migrations/`. Now this audit has a git-tracked source of truth.
5. Re-test the four flows after every policy change. The biggest risk in this work is breaking admin/participant/presenter flows, not the policies themselves.
