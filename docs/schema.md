# Database Schema Snapshot

**Project:** Texas Jury Study
**Snapshot date:** 2026-05-22
**Source:** Supabase dashboard SQL export

This is a point-in-time snapshot. For policy/RLS state see [rls-policies.md](./rls-policies.md). For live truth always query Supabase.

> WARNING: This schema is for context only and is not meant to be run. Table order and constraints may not be valid for execution.

---

## Schema

```sql
CREATE TABLE public.case_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  original_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  name_attested boolean NOT NULL DEFAULT false,
  name_attested_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT case_documents_pkey PRIMARY KEY (id),
  CONSTRAINT case_documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id),
  CONSTRAINT case_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);

CREATE TABLE public.case_drive_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT case_drive_links_pkey PRIMARY KEY (id),
  CONSTRAINT case_drive_links_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id),
  CONSTRAINT case_drive_links_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);

CREATE TABLE public.cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  number_of_attendees integer NOT NULL DEFAULT 10,
  documentation_type text NOT NULL,
  filters jsonb NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['new'::text, 'current'::text, 'previous'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  scheduled_at timestamp with time zone,
  deleted_at timestamp with time zone,
  admin_status text NOT NULL DEFAULT 'all'::text,
  approved_at timestamp with time zone,
  requestee_id uuid,
  schedule_status text DEFAULT 'pending'::text,
  admin_scheduled_at timestamp with time zone,
  parent_case_id uuid,
  drive_link text,
  rejection_reason text,
  case_type text,
  hours_requested integer,
  focus_group_type text,
  county text,
  participants_from_county text,
  session_completion_timeframe text,
  preferred_day text,
  deadline_date timestamp with time zone,
  delivery_mode text NOT NULL DEFAULT 'online' CHECK (delivery_mode IN ('online', 'offline')),
  CONSTRAINT cases_pkey PRIMARY KEY (id),
  CONSTRAINT cases_presenter_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT cases_presenter_id_fkey1 FOREIGN KEY (requestee_id) REFERENCES auth.users(id),
  CONSTRAINT cases_parent_case_id_fkey FOREIGN KEY (parent_case_id) REFERENCES public.cases(id)
);

CREATE TABLE public.confidentiality_agreements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  agreed boolean NOT NULL,
  agreed_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  signature_data text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT confidentiality_agreements_pkey PRIMARY KEY (id),
  CONSTRAINT confidentiality_agreements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.confidentiality_agreements_requestee (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  agreed boolean NOT NULL,
  agreed_at timestamp with time zone NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  signature_data text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT confidentiality_agreements_requestee_pkey PRIMARY KEY (id),
  CONSTRAINT confidentiality_agreements_presenter_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.jury_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  gender text NOT NULL,
  race text NOT NULL,
  county text NOT NULL,
  availability_weekdays text DEFAULT false,
  availability_weekends text DEFAULT false,
  email character varying NOT NULL UNIQUE,
  phone text NOT NULL,
  street_address text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  state text NOT NULL DEFAULT 'Texas'::text,
  zip_code text NOT NULL,
  country text NOT NULL DEFAULT 'USA'::text,
  served_on_jury text NOT NULL,
  convicted_felon text NOT NULL,
  us_citizen text NOT NULL,
  has_children text NOT NULL,
  served_armed_forces text NOT NULL,
  currently_employed text NOT NULL,
  marital_status text NOT NULL,
  political_affiliation text NOT NULL,
  education_level text NOT NULL,
  industry text,
  family_income text NOT NULL,
  heard_about_us text NOT NULL,
  entry_date timestamp without time zone NOT NULL,
  date_updated timestamp without time zone NOT NULL,
  profile_completed boolean DEFAULT false,
  driver_license_number text,
  driver_license_image_url text,
  blacklist_reason text,
  blacklisted_at timestamp with time zone,
  eligible_after_at timestamp with time zone,
  approved_by_admin boolean DEFAULT false,
  paypal_username text,
  date_of_birth date,
  CONSTRAINT jury_participants_pkey PRIMARY KEY (id, email)
);

CREATE TABLE public."oldData" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  age integer NOT NULL,
  gender text NOT NULL,
  race text NOT NULL,
  county text NOT NULL,
  availability_weekdays text,
  availability_weekends text,
  availability_anytime text,
  email character varying NOT NULL,
  phone text NOT NULL,
  street_address text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL,
  country text NOT NULL,
  served_on_jury text NOT NULL,
  convicted_felon text NOT NULL,
  us_citizen text NOT NULL,
  has_children text NOT NULL,
  served_armed_forces text NOT NULL,
  currently_employed text NOT NULL,
  internet_access text NOT NULL,
  marital_status text NOT NULL,
  political_affiliation text NOT NULL,
  education_level text NOT NULL,
  industry text,
  family_income text NOT NULL,
  heard_about_us text NOT NULL,
  entry_date timestamp without time zone NOT NULL,
  date_updated timestamp without time zone NOT NULL,
  dob date,
  CONSTRAINT "oldData_pkey" PRIMARY KEY (id)
);

CREATE TABLE public.roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['participant'::text, 'requestee'::text, 'admin'::text, 'blacklisted'::text])),
  created_at timestamp with time zone DEFAULT now(),
  email character varying,
  CONSTRAINT roles_pkey PRIMARY KEY (user_id),
  CONSTRAINT roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.session_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  case_id uuid,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT session_cases_pkey PRIMARY KEY (id),
  CONSTRAINT session_cases_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT session_cases_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id)
);

CREATE TABLE public.session_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  participant_id uuid,
  invite_status text, -- pending | accepted | declined | rejected | waitlisted
  responded_at timestamp with time zone,
  struck_at timestamp with time zone,
  struck_by uuid,
  waitlist_position integer,              -- 1-based reserve slot, in accept order
  waitlist_outcome text,                  -- called_in | waited_out | offer_declined (NULL = undecided)
  waitlist_outcome_at timestamp with time zone,
  payout_cents integer,                   -- what this person is owed for the session
  CONSTRAINT session_participants_pkey PRIMARY KEY (id),
  CONSTRAINT session_participants_waitlist_outcome_check CHECK (waitlist_outcome IS NULL OR waitlist_outcome IN ('called_in', 'waited_out', 'offer_declined')),
  CONSTRAINT session_participants_struck_by_fkey FOREIGN KEY (struck_by) REFERENCES auth.users(id),
  CONSTRAINT session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT session_participants_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES auth.users(id),
  CONSTRAINT session_participants_jury_participants_fkey FOREIGN KEY (participant_id) REFERENCES public.jury_participants(user_id),
  CONSTRAINT session_participants_profiles_fkey FOREIGN KEY (participant_id) REFERENCES auth.users(id)
);

CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  send_completion_email boolean DEFAULT false,
  completion_email_sent boolean DEFAULT false,
  completion_notification_enabled boolean DEFAULT false,
  zoom_link text,
  location text,                           -- venue address of an in-person session; set when the session is created, and in every invitation
  participant_cap integer DEFAULT 10,
  waitlist_cap integer NOT NULL DEFAULT 2, -- reserve slots offered once seats fill (same in both formats; only the hold window and fee differ)
  session_full_notified boolean DEFAULT false,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
```

### Triggers

| Trigger | Table | What it enforces |
|---|---|---|
| `session_cases_single_delivery_mode` | `session_cases` (BEFORE INSERT OR UPDATE OF `session_id`, `case_id`) | A session's cases must all share one `delivery_mode`. Raises `check_violation` on a mix. |
| `cases_lock_scheduled_delivery_mode` | `cases` (BEFORE UPDATE OF `delivery_mode`) | A case already in a session cannot change format. Raises `check_violation`. Same-value writes pass. |
| `cases_protect_admin_fields` | `cases` (BEFORE INSERT OR UPDATE) | For `authenticated` and `anon` callers who aren't admins (`public.caller_is_admin()`): no change to `approved_at`, `admin_scheduled_at` or `requestee_id`; `admin_status` and `rejection_reason` only by Request Again (`rejected` → `all`, reason cleared); once a case is `approved` or `submitted`, only `schedule_status`, `scheduled_at`, `status`, `deleted_at`, `filters` and `updated_at`; `filters` locked once `admin_scheduled_at` is set; a new case starts `all` with the other four NULL. Raises `insufficient_privilege`. Admins, the service role and the SQL Editor pass. |
| `cases_release_slot_booking` | `cases` (AFTER UPDATE OF `admin_status`, `deleted_at`, `delivery_mode`) | Frees an **unpaid** time-slot hold on a slot that hasn't started (`requestee_slot_bookings.slot_id` → NULL) when its case is rejected, archived while under review, or switched to in person. A rejection also clears `held_since`. A paid hold is left for an admin. SECURITY DEFINER, EXECUTE revoked. |
| `cases_keep_paid_slot_booking` | `cases` (BEFORE DELETE) | No delete a non-admin makes can take a case whose time-slot booking is paid: the booking row would go with it (ON DELETE CASCADE), and `paid_at` is the only record of the payment. That covers a case deleted along with another one, such as a follow-up whose parent is deleted, should that foreign key cascade. The caller is the request's role setting (`authenticated` / `anon`), not `current_user`, which is the table's owner inside a cascade. Raises `insufficient_privilege`. The service role, the SQL Editor, the auth server and an admin on their own login pass (no DELETE policy lets an admin's login delete a firm's case, so staff remove one in the SQL Editor or through server code). SECURITY DEFINER so it can read the admin-only bookings; EXECUTE revoked. It locks the booking row (FOR SHARE) while it decides, so an admin marking it paid at that moment waits, and then finds it gone rather than losing the payment with it. The migration's verify query also shows what deleting a parent case does to its follow-ups in production, which the schema export doesn't. |

---

## Schema oddities worth tracking

These aren't bugs but they're surprises a future reader will hit:

1. **`session_participants_profiles_fkey`** — duplicate FK leftover from the dropped `profiles` table. Points to `auth.users(id)`, which is already covered by `session_participants_participant_id_fkey`. Safe to drop.
2. **`cases_presenter_id_fkey` / `cases_presenter_id_fkey1` / `confidentiality_agreements_presenter_user_id_fkey`** — leftover names from the presenter→requestee rename. Functional but misleading.
3. **`jury_participants_pkey PRIMARY KEY (id, email)`** — composite PK on `(id, email)` instead of just `id`. Unusual; means email changes require special handling. Both columns are already `UNIQUE` individually, so the composite adds nothing.
4. **`availability_weekdays`/`availability_weekends`** are `text` with `DEFAULT false` — a boolean default on a text column. Code stores `"Yes"`/`"No"`, so the default never matches what reads expect.
5. **`oldData`** uses CamelCase — requires quoting (`"oldData"`) in every raw SQL query.
6. **`jury_participants.profile_completed` is dead** — `DEFAULT false` and nothing in the app ever writes it, so it reads `false` for all 1411 rows (verified 2026-08-17). Don't render it; the real "profile complete" gate is `driver_license_number` + `driver_license_image_url` + `paypal_username`, enforced in `updateInviteStatus` before an accept is allowed. Candidate for dropping.
7. **A `jury_participants` row is not proof of an account** — `user_id` has no FK onto `auth.users`, so a profile can exist for someone who never created a login. Those people can never be invited: `session_participants.participant_id` *does* FK onto `auth.users(id)`, so the insert fails with `23503`. As of 2026-08-19 exactly one row is in this state (the `test 3` profile), out of 1415. `roles` was **not** a usable proxy for "has a login" either: 557 logins (556 participants created 2026-02-13 to 2026-05-15, and one law firm) had no `roles` row. They were backfilled on 2026-10-03, and the `assign_role_on_signup` trigger now gives every new login a row (see the 2026-10-03 entry below). The check lives in `public.jury_participants_without_login()` (`20260819_jury_participants_without_login.sql`), wrapped by `client/lib/participant/loginAccount.ts`.
8. **A session has no `delivery_mode` column — it is derived from its cases.** `cases.delivery_mode` decides everything: `$850/hr` vs `$1,500/hr` to the requestee, `$30/hr` vs `$40/hr` to participants, a Zoom link vs an address, and the waitlist's hold window and waiting fee. A session's mode is whatever its cases share, which the `session_cases_single_delivery_mode` trigger keeps single-valued. Read it through `client/lib/case/getSessionDeliveryMode.ts` (server) or `sessionDeliveryMode()` in `client/lib/case/deliveryMode.ts` (pure). **A session with no cases has no mode** — both helpers return `null`, and the `…OrDefault` variants fall back to `'online'`. Never infer the mode from `zoom_link`/`location` being set: `zoom_link` is null until an admin sends it, and `location`, though now required before an in-person session can invite anyone, is null on any in-person session created before 2026-10-12 until an admin saves one.
9. **The waitlist runs on different terms per format.** `sessions.waitlist_cap` applies to both — what differs is the hold window and the flat waiting fee: **15 min / $10 online, 30 min / $30 in person**, with in-person holders asked to arrive 15 minutes early. Read those two through `waitlistHoldMinutes()` / `waitlistWaitFeeCents()` in `client/lib/participant/waitlist.ts`, never the bare `WAITLIST_*` constants, or an in-person waitlister gets quoted the online terms. (Between 2026-08-25 and 2026-08-26 in-person sessions had no waitlist at all; that rule is gone.)
10. **`jury_participants.reactivation_status` is the attendance gate** — it is what the admin participants table shows as the "Active" column, and since 2026-08-18 only an explicit `'yes'` may attend a session. `'pending'`, `'no'` and `NULL` are all treated identically: we have no current confirmation the person still participates. There is no CHECK constraint on the column, so a mistyped value silently reads as inactive. The rule has one definition in `client/lib/participant/activeStatus.ts`; see the cleanup log for the enforcement points.

---

## Recent cleanups

| Date | Change |
|------|--------|
| 2026-10-27 | **Promo codes** (`20261027_promo_codes.sql`). A whole percentage, **1 to 99**, off a case's whole total (base hours and filters), until the case is paid. New tables: `promo_codes` (`code` UNIQUE, kept in capitals and matched without regard to case; `percent_off`; optional `expires_on`, the last day it works in Central Time; optional `max_uses`; `firms_only`; `active`), `promo_code_firms` (the firms a `firms_only` code is for; deleting a firm's login removes its row and the code stays limited, never opening to everyone), and `case_discounts` (**one per case**: `promo_code_id`, NULL for an admin's own percentage typed without a code; `percent_off`, **copied when applied**, so editing or switching off a code later doesn't change a case that has it; `applied_by`, `applied_by_admin`, `applied_at`). A **use** is a case holding the code now: removing it from an unpaid case frees the use, and a paid case keeps its discount. Every change to `case_discounts` goes through `apply_promo_code(...)`, `set_case_discount(...)` or `remove_case_discount(...)` (with `check_promo_code(...)` for the new-case form, before the case exists). Each takes a per-case advisory lock and locks the case's `requestee_slot_bookings` row (FOR SHARE), so an admin marking it paid at that moment waits, and refuses with `paid` once `paid_at` is set; `apply_promo_code` also locks the code's row, so two cases can't both take its last use. EXECUTE for `service_role` only. A firm types a code on the new-case form or its case page and may replace or remove any discount on its unpaid case, an admin's included; an admin can apply a code (held to its limits for the case's firm) or an own percentage on any case, and manages codes on Requestees → Promo Codes. Codes are switched off, never deleted (no DELETE grant, and `case_discounts` restricts it). The receipt and invoice show the discount as "Discount (10% off)", never the code; `syncInvoice` reads it, so an unpaid invoice is revised when it changes. **Run the migration before deploying.** |
| 2026-10-23 | **Invoices are kept, with sequential numbers** (`20261023_invoices.sql`). New table `invoices`, **one per case** (`case_id` UNIQUE, ON DELETE SET NULL so the record outlives a deleted case): `invoice_number` (UNIQUE, `INV-2026-0001` style, sequential per Central Time year), `firm_id`, `issued_at`, `billed_to_name` / `billed_to_email`, `case_title`, `delivery_mode`, `lines` (jsonb, the same rows as the firm's Receipt Value), `total_cents`, `revised_at`, `voided_at`. `invoice_counters` holds each year's last number. Numbers come only from `issue_invoice(...)`, which takes a per-case advisory lock and the year's counter row, so a case never gets two invoices and two cases never share a number; EXECUTE for `service_role` only. **The app** (`client/lib/invoiceData.ts`) issues the invoice when a case is approved or its firm holds a time (or when the invoice is first opened, for older cases), revises it while unpaid so it keeps matching the receipt, voids it when the case is rejected or archived unpaid, and never changes it once the booking is paid; the number and issue date never change. Before an admin marks a booking paid, its invoice is brought up to date. Admins can SELECT through `is_admin()`; firms read theirs through the app's server. Replaces the number made from the case id (`INV-3F9A12BC`) that the first version of the invoice page showed. **Run the migration before deploying.** |
| 2026-10-17 | **The Time Slots calendar and Build Session work together.** No schema change. A slot's cases make one session: the calendar's slot window has a **Build session** button that opens Build Session with the slot's cases that are approved and not in a session yet (and says how many are still awaiting approval). Build Session fills in the session date from the booked slot and each booked case's start one after another from the slot's start, earliest booking first, each for the hours it paid for (`client/lib/case/slotPrefill.ts`); the admin can change anything. It warns, without blocking, about a case whose booking isn't paid yet. The calendar shows each booked case's session once built, and both the calendar and the sessions page (each case's time, and the Reschedule dialog) warn when a session runs outside the slot its firm booked; nothing is refused. **Late bookings:** firms can still book a slot's leftover hours after its session is built, until that session invites participants; then the slot stops being offered to firms (`slotsClosedToFirms` in `client/lib/slotBookingData.ts`), and booking it is refused with "email us", because the panel was chosen for the cases already in it. For a slot with a session, the calendar's button becomes **Add N cases to the session**: `addSlotCasesToSession` (`client/lib/actions/session.ts`) adds the slot's approved cases that aren't in a session after the session's last case, each for its paid hours, and sends their firms the Session Scheduled email. If participants are already invited the admin confirms first; those holding a place are emailed the new time and repriced, as after a reschedule. |
| 2026-10-17 | **Several firms can share a time slot's hours** (`20261017_shared_slot_hours.sql`). A slot is now a session window with hours to sell: each booked case takes the hours its firm pays for (`hours_requested`, or 1 hour when empty), and the slot is full when they add up to its length. Before, one case held a whole slot, so a 1-hour case on a 9-12 slot blocked all three hours. Firms claim hours, not a time inside the slot; the admin sets each case's time when building the session. The migration drops `requestee_slot_bookings_slot_key` (UNIQUE `slot_id`) and indexes `slot_id`. Trigger `slot_bookings_keep_within_hours` (BEFORE INSERT OR UPDATE OF `slot_id`, `case_id` on `requestee_slot_bookings`) refuses a booking, move or hand-over to another case that would overfill a slot, and `cases_keep_booked_hours_within_slot` (BEFORE UPDATE OF `hours_requested` on `cases`) refuses raising a booked case's hours past what its slot has left, except in an edit that also takes the case out of its slot (rejected, archived under review, or switched to in person, with an unpaid hold on a slot that hasn't started), which `cases_release_slot_booking` then frees. The booking trigger locks the case row before the slot, as a change of hours does, so the two can't each count without the other. Both lock the slot's row before counting, so two firms booking at once can't both take the last hours, and both refuse with SQLSTATE 23514 and a message starting `requestee_slot_full`. They apply to admins too. A booking already over its slot from before stays, but can't grow. The helper `slot_minutes_left_for(uuid, uuid)` they share is SECURITY DEFINER with EXECUTE revoked. **Screens:** firms see "2 of 3 hours left" on a part-booked slot and only slots with room for their hours; a firm asking for more hours than its slot has left is told why on its dashboard; the held-time email says how many hours of the time are held. The admin calendar shows each slot's hours booked and left and every booking in it, and moves and bookings for a firm only go to slots with room. **Run the migration before deploying.** |
| 2026-10-15 | **A case runs no longer than its firm paid for.** No schema change. A firm is billed for its case's `hours_requested`, or 1 hour when that is empty (`billableHours`, the receipt's rule), so that is the most time the case gets in a session (`client/lib/case/paidTime.ts`). **Build Session**'s end time only offers times up to that length after the start, and the page checks again before it creates the session; `addCasesToSession` refuses a longer case before inserting anything. **Reschedule** shows each case's paid time and won't save a case made longer than it, though a case that already ran longer, from before this, may keep its length (the dialog flags it); `rescheduleSession` checks the same before its first write. **Replace Case** greys out cases paid for less than the slot, and `replaceCaseInSession` refuses them before detaching the old case. A booked time slot can be longer than the case: it says when the case can run, not for how long. Admins can't change a case's hours after approval, so giving a firm more time means changing `hours_requested` in the SQL Editor. |
| 2026-10-16 | **Firms book the time slots.** No schema change (uses `requestee_slot_bookings`). On the **new-case form**, an online case gets a "Pick a time" list of the admin's open slots, in Central Time, at least 48 working hours ahead and at least as long as the hours requested; picking one replaces the timeframe, preferred-day and Preferable Date questions, which are then saved empty. The case is saved first, then the time is held, so a slot taken in the meantime leaves a saved case and a message to pick another on the case page. In-person cases are told to email info@ to arrange a time. The firm's **case page** has a "Focus group time" box: hold, switch or cancel a time while the case is under review (a switch keeps the payment clock and any payment; a paid time can't be cancelled by the firm); after approval it says to email info@. The dashboard shows "Time held" on each case. Each booking, switch and cancel emails the firm (for a hold) and info@. Firms reach the table only through `client/lib/actions/requesteeSlotBooking.ts`. |
| 2026-10-16 | **Bookings of the time slots, admin side** (`20261016_requestee_slot_bookings.sql`). New table `requestee_slot_bookings`, **one row per case**: `case_id` (primary key, ON DELETE CASCADE), `slot_id` (UNIQUE, nullable, ON DELETE RESTRICT), `booked_by`, `held_since` (start of the payment clock), `paid_at` / `paid_by`, `updated_at`. The keys do the hard part: a case holds at most one slot, a slot is held by at most one case (two firms racing get a 23505), and a booked slot can't be deleted (23503) until the booking is moved or released. The row outlives the slot, so a firm that switches or cancels keeps its payment clock and any payment; only an admin's release for non-payment, or a rejection, clears the clock. **Payment** isn't tracked anywhere else: the admin marks a booking paid. It is due 24 working hours after `held_since` (Monday to Friday on the Central clock; `client/lib/slotBooking.ts`), and the admin may release an unpaid hold after that, which emails the firm. Trigger `cases_release_slot_booking` (AFTER UPDATE OF `admin_status`, `deleted_at`, `delivery_mode`; SECURITY DEFINER, EXECUTE revoked) frees an **unpaid** hold on a slot that hasn't started when its case is rejected, archived while under review, or switched to in person; a paid hold is left for an admin. Admin screens: the Time Slots calendar colours each slot by state (open, unpaid, overdue, paid) with the firm's name, and its window marks paid, moves or releases the booking; the admin case page has a **Time slot** box (and can book a time for the firm); the case lists and Build Session show the booked slot. Trigger `cases_keep_paid_slot_booking` (BEFORE DELETE) stops a firm deleting a case whose booking is paid, directly or by deleting its parent case, which would delete the payment record with it; the dashboard offers those an email to info@ instead of Permanently Delete, and says so when the database refuses a delete. Admin-only RLS through `is_admin()`, explicit grants. The migration needs `20261014_requestee_time_slots.sql` and F28's `20261005_protect_case_admin_fields.sql` first and refuses to run without them. **Run the migration before deploying.** |
| 2026-10-14 | **Time slots for law firms, admin side** (`20261014_requestee_time_slots.sql`). New table `requestee_time_slots`: `id`, `starts_at` / `ends_at` (timestamptz, CHECK end after start), `note` (at most 200 characters, shown to firms) and `created_by` (ON DELETE SET NULL). Admins open slots on **Requestees > Time Slots** (`/dashboard/Admin/requestees/time-slots`): a month calendar, plus an **Add Time Slots** button there and on the Requestees page. Times are entered and shown in Central Time whatever the admin's own time zone; `client/lib/requesteeTimeSlots.ts` does the conversion. One add can repeat weekly for up to 12 weeks. Slots in the past and slots that overlap an existing one are refused; slots that only touch are fine. Admin-only for now (RLS through `is_admin()`, explicit grants, see [rls-policies.md](./rls-policies.md)). Firms will book slots for **online** focus groups in a later change; in-person cases will be asked to contact us. Same change: `localToUTC` (`client/lib/timezone.ts`) now measures the zone's offset at the converted instant, not at the wall-clock time read as UTC. Before, an early-morning time on the day the clocks change came out an hour off, for example 3:00 AM Central on 2026-11-01 as 2:00 AM. Session times are converted by the same function, so they are fixed too. **Run the migration before deploying:** the Time Slots page reads the table. |
| 2026-10-14 | **Firms can no longer set the admin fields on their own cases** (`20261005_protect_case_admin_fields.sql`, F28 in [rls-policies.md](./rls-policies.md)). The `cases` UPDATE policies limit rows, not columns, and the INSERT policies only check `user_id`, so from the browser a firm could approve its own case, write its own rejection reason or proposed session time, point `requestee_id` at another login, or change hours, format and filters after approval; a new case could start approved. New trigger `cases_protect_admin_fields` (see Triggers above) refuses those for `authenticated` and `anon` callers who aren't admins, and leaves every write the firm dashboard makes alone. New helper `public.caller_is_admin()`: SECURITY DEFINER, `search_path = ''`, true when `auth.uid()` has `roles.role = 'admin'`, EXECUTE for `authenticated` only (revoked from `PUBLIC` and `anon`). The trigger needs it because admins write these columns through their own login, not the service role; it doesn't use the live `is_admin()`, which no migration here defines. Safe to run before or after the app deploy; the migration checks itself as a firm and as an admin and rolls back on a failure. An admin-only column added to `cases` later must be added to the trigger's lists. |
| 2026-10-12 | **In-person invitations now say where the session is.** No schema change. `sessions.location` used to be filled in after the fact, from the sessions page, and emailed only to people who had already accepted, so the invitation itself said "we will email you the full address once you accept". Whether someone can attend depends on where the venue is, so the address now goes out with the invite. **Create Session** has a required *Venue Address* box for in-person sessions, prefilled with `OFFLINE_VENUE_TEXT` (Heritage Plaza Office Suites, 402 Simonton St, Conroe, TX 77301) and saved by `createSession`. **`inviteParticipants` refuses an in-person session with no address**: nobody is invited, so no invitation can go out without one. It reads the session's format first, then the address with the service role, since a requestee reaches it too. Every invite path goes through it: Create Session, Invite More, and the requestee's add. The invitation shows the address with a Maps link (`venueAddressBlock` in `mail.ts`, escaped) and puts it in the JSON-LD; the accepted / presence-confirmed / session-created emails, both of the participant's pending-invitation cards (the dashboard and My Sessions) and the page shown after accepting from the email show it too. A session with no address, which only an invitation from before this change can belong to, keeps the "address to follow" wording on each of those. `LocationSender` on the sessions page is now the **Venue Address** box: it saves a change, or adds an address to an in-person session created before this, and emails it to everyone accepted or waitlisted. Pending invitees keep the address from their invitation; a changed venue is not re-sent to them. |
| 2026-10-04 | **Participants are asked about in-person focus groups** (`20261004_participant_offline_interest.sql`). New column `jury_participants.interested_in_offline`: `'Yes'` / `'No'` text, CHECK-constrained, nullable. The question names the venue (`OFFLINE_VENUE` in `client/lib/constants/offline-catchment.ts`: Heritage Plaza Office Suites, 402 Simonton St, Conroe, TX 77301). It is required on signup (`ParticipantForm`) and when a participant saves their own profile (`EditProfileForm`), so anyone who signed up earlier answers it on their next save. It is optional on the admin edit page, so an admin never answers for them. `NULL` means not answered yet, never No. Admins see the answer under Account & Activity on the participant page; firms don't. Nothing reads it for candidate selection yet: `applyOfflineCatchment` still picks in-person candidates by county only. The F26 trigger lists the columns it protects, so participants can write this one. **Run the migration before deploying:** the forms send the column, so signup fails until it exists. |
| 2026-10-03 | **Participants can no longer set the admin and system fields on their own profile** (`20261003_protect_participant_admin_fields.sql`, F26 in [rls-policies.md](./rls-policies.md)). The UPDATE policy on `jury_participants` limits rows, not columns, so from the browser a participant could approve themselves, mark themselves active, skip the cooldown after a session or clear their strikes. A trigger now refuses, for the `authenticated` and `anon` roles, any change to `approved_by_admin`, `blacklisted_at`, `blacklist_reason`, `flag_count`, `eligible_after_at` and the `reactivation_*` fields, and a new profile that starts approved, active or with strikes. Server code and the SQL Editor are unaffected. An admin-only column added later must be added to the trigger's list. |
| 2026-10-03 | **Every login now has a `roles` row** (`20261003_roles_row_for_every_login.sql`). Nothing in the database made one exist: only the signup action wrote it, in a separate call after `createUser`. 557 logins had none: 556 participants created between 2026-02-13 and 2026-05-15, and one law firm. The firm was missing from the admin Requestees list, and four of those participants were blacklisted on `jury_participants.blacklisted_at` but not in `roles`. Backfilled by hand on 2026-10-03 (participant, or blacklisted where `blacklisted_at` is set; the firm as requestee); the migration repeats the backfill for any login still missing a row. New: an AFTER INSERT trigger on `auth.users`, `assign_role_on_signup` (SECURITY DEFINER, `search_path = ''`, no EXECUTE grants), writes the row in the same transaction as the login, however the login was made (signup form, Supabase dashboard, import). It takes `requestee` from `user_metadata.role` and makes everything else `participant`; it never assigns `admin` or `blacklisted`. The signup action now upserts its `roles` row on `user_id` instead of inserting it, since the trigger has usually written it first. Deploy the app before running the SQL, or every signup fails on the duplicate key. |
| 2026-10-01 | **Reactivation email: an Unsubscribe link, and the send now skips "No".** No schema change. The reactivation ("are you still interested?") email is commercial email under CAN-SPAM, so its footer now says it is a solicitation and carries an **Unsubscribe** link (an `unsubscribe` token in `client/lib/reactivationToken.ts`, valid for a year; Yes/No/edit stay at 30 days), plus `MAILING_ADDRESS` once that is set. It is still `null`, and the send doesn't wait for it. Opening the link only shows an Unsubscribe button; pressing it (a POST to `/api/email-action/reactivate`) sets `jury_participants.reactivation_status = 'no'` whatever it was, keeping the first `reactivation_confirmed_at` on a repeat. That is the same status as answering No: no new invitations, and an open invitation can't be accepted. Seats they already accepted stay booked, and the page tells them to email support to cancel one. Only the button's POST writes, so a scanner that opens the Unsubscribe link changes nothing. The No link is unchanged and still writes on a plain GET (Next answers HEAD with GET too), so a scanner that opens it still moves a `pending` row to `no`. `sendReactivationEmails` and the send-mail confirm page now skip `reactivation_status = 'no'`; before, the send ignored No answers. |
| 2026-08-26 | **Reschedule now resyncs the values derived from a session's schedule.** `payout_cents` and `jury_participants.eligible_after_at` are both snapshots taken at accept time from the then-current `session_cases` rows. `rescheduleSession` rewrites those rows — the modal edits each case's start AND end time, not just the date — and never revisited either, so a duration change left both stale with no trigger or cron to catch it. Concretely: a seat priced at accept time stayed on the old hours while `callInWaitlistParticipant` prices a called-in waitlister **live**, so two people on the same session were paid different amounts for the same hours. New `resyncScheduleDerivedValues` in `client/lib/actions/session.ts` recomputes both. **What it deliberately does not touch:** waitlisted / waited-out rows (a flat per-mode fee that takes no hours argument — recomputing it as hours × rate would turn a $30 waiting fee into a full session payout), and rows where `payout_cents IS NULL` (the column was added 2026-08-20 with no backfill, so repricing on `invite_status` alone would *originate* money on historical sessions). Two guards: it bails when `sessionLengthHours` returns 0, since `seatPayoutCents(0)` is 0 and a failed read would silently zero every seat; and it skips repricing a **past-dated** session, because there is no paid flag, no `paid_at` and no payout ledger anywhere in the schema while Reschedule is reachable from the Past tab — rewriting the amount there could contradict money already sent by hand. Cooldown is still corrected in that case (inert for a past date). The cooldown half matters independently: anchored to the session end, left stale on a session moved *later* a participant becomes eligible again before the session they are still committed to, and can be invited onto a second one. Covered by a new `reschedule-session.test.ts` block in `sessions.test.ts` — seven cases, one per hazard, with the two negative tests carrying a witness assertion so they cannot pass by crashing early. |
| 2026-08-26 | **In-person catchment, and a county-matching bug fixed.** In-person sessions now draw from a fixed venue catchment — **Montgomery, Walker, San Jacinto, Grimes, Harris and Houston counties** (`client/lib/constants/offline-catchment.ts`). The catchment **replaces** the case's own county: a travel radius belongs to the venue, not the lawsuit, so a case pending in Dallas still draws from these six. `withCountyRestriction` no longer special-cases offline; it only honours an explicit "participants from my county". The catchment is applied by `applyOfflineCatchment` as a **hard constraint** beside the blacklist / cooldown exclusions, **not** through `filters.location` — that key is `FILTER_PRIORITY[0]`, so `relaxFilters` would drop it first and surface people who cannot reach the venue. It is also folded into the candidate-pool ceiling count, or the relaxation loop chases a target the catchment cannot reach. **The bug:** `jury_participants.county` stores `'Harris County'` while `TEXAS_COUNTIES` and every filter use `'Harris'`, and matching was a plain case-insensitive equality (`ilike` with no wildcard server-side, `includesCI` client-side). A Harris filter matched **5** rows instead of **105** — this had been quietly shrinking every county-filtered case, not just offline ones. Fixed by normalising the `' County'` suffix on both sides: `normalizeCountyName` / `countyMatches` / `countyQueryForms` in `filter-utils.ts`; `includesCI` is gone (county comparison was its only caller). The query lists both exact spellings rather than using `Harris%`, which would also match **Harrison County**. No data was rewritten. **Panel depth is the real limit:** the catchment holds ~105 participants of whom ~16 are active, against 10 seats plus reserves. Requestees see the county list read-only under the In-Person option. |
| 2026-08-26 | **Offline terms revised** (`20260826_offline_terms_revision.sql` — comment only; every figure lives in application code). Requestee **$10,000/hr → $1,500/hr** (`receipt-pricing.ts`); participant **$100/hr → $40/hr** (`waitlist.ts`). **In-person sessions now HAVE a waitlist**, reversing the day-old rule: `waitlistCapFor()` no longer forces the cap to 0, and `callInWaitlistParticipant` / `markWaitlistWaitedOut` no longer refuse. The terms differ by format rather than the capacity — **15 min / $10 online vs 30 min / $30 in person**, in-person holders arriving 15 minutes early — exposed as `waitlistHoldMinutes()` and `waitlistWaitFeeCents()`; `supportsWaitlist()` is gone. New `sendWaitlistLocationEmail` template (the venue counterpart to `sendWaitlistZoomLinkEmail`), and `sendWaitlistConfirmationEmail` / `sendWaitlistWaitedOutEmail` take an `offline` flag. `sendSessionLocation` now mails waitlisters too, and the waitlisted outcome carries `deliveryMode` so redirect banners quote the right terms. Participant-facing copy through the session and profile flow asks for a **Texas State ID** instead of a driver's license — the invite/location/waitlist emails, the missing-profile interstitials and banners, the reactivation email, and the signup and profile-edit forms. **Not yet converted:** `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/participants/page.tsx` and `app/contact/page.tsx`, which are legal and marketing prose and still say "driver's license" — deliberately left for a copy decision, since naming only a state ID there could read as refusing a licence. |
| 2026-08-25 | **Offline (in-person) cases** (`20260825_offline_cases.sql`). `cases.delivery_mode` (`'online'` \| `'offline'`, NOT NULL DEFAULT `'online'` — every existing row is online) and `sessions.location` (the address; the offline twin of `zoom_link`). One definition of the concept in `client/lib/case/deliveryMode.ts`, with the server-side session lookup in `client/lib/case/getSessionDeliveryMode.ts`. What changes when a case is offline: the requestee is quoted **$10,000/hr** instead of $850/hr (`receipt-pricing.ts`, `$100`-per-filter add-ons unchanged); participants are paid **$100/hr** instead of $30/hr (`waitlist.ts`); there is **no waitlist** at all (`waitlistCapFor()` forces the cap to 0, so overflow takes the session-full path and the call-in / waited-out actions refuse); the admin sends an **address** via `LocationSender` → `sendSessionLocation()` instead of a Zoom link; and candidate lists force the case's county filter on (`withCountyRestriction` in `filter-utils.ts`), because attendees have to reach the venue. **A session cannot mix the two** — enforced in `addCasesToSession` / `replaceCaseInSession` (both check *before* writing, so a refusal leaves the session intact), in the case-picker UI (`CaseModeSelectionGuard` greys out the other format), on `/dashboard/Admin/sessions/new` (a blocking screen with one-click links to split the selection), and by the `session_cases_single_delivery_mode` trigger for hand-run SQL. A scheduled case's format is frozen by the `cases_lock_scheduled_delivery_mode` trigger. Requestees pick the format on the new-case form and can change it until the case is scheduled. Offline email bodies are separate templates, not branches: `sendSessionLocationEmail`, plus an `offline` flag on `sendSessionCreatedEmail`, `sendInviteAcceptedConfirmationEmail`, `sendPresenceConfirmedEmail` and `sendPresenterInfoEmail`. |
| 2026-08-19 | Participants with no login account are no longer offered for invites. `session_participants.participant_id` FKs onto `auth.users(id)`, so a `jury_participants` row whose user never signed up fails the insert with `23503` — and that is what killed a whole invite batch (2 selected, 0 invited, raw FK error in the modal). Added `public.jury_participants_without_login()` (`20260819_jury_participants_without_login.sql`, SECURITY DEFINER, `service_role` only — `auth.users` is not reachable through PostgREST), wrapped by `client/lib/participant/loginAccount.ts`. `inviteParticipants` drops them before the insert and names them (`skipped.noAccount` + `rejected`), so the rest of the selection still goes out; the four candidate lists (`sessions/new`, `sessions` invite-more, `searchEligibleParticipants`, `searchParticipantsForCase`) filter them out, and both search boxes show them greyed-out with a "No login" badge. Until the migration is applied, the invite guard falls back to per-id `auth.admin.getUserById` for the selection, and only a definitive "User not found" counts — one live auth row answers "Database error loading user" and must not be mistaken for a missing account. |
| 2026-08-18 | Attendance is now limited to active panel members — `reactivation_status = 'yes'`. One definition in `client/lib/participant/activeStatus.ts`. Hard-enforced at three write points: `inviteParticipants` (non-active are never invited, alongside the existing blacklist guard), `updateInviteStatus` (a non-active participant cannot accept — checked *before* the DL/PayPal profile gate), and `adminRespondOnBehalf` (an admin cannot accept for them either; rejecting is always allowed). The four candidate lists (`sessions/new`, `sessions` invite-more, `searchEligibleParticipants`, `searchParticipantsForCase`) filter to `'yes'` so nobody is offered who would be rejected; the Invite More search additionally surfaces non-active matches greyed-out with a "Not active" badge, the same way blacklisted and lineage-blocked rows are shown. **Note the blast radius:** on 2026-08-18 only 119 of 1389 approved, non-blacklisted participants were `'yes'` (1250 `'pending'`, 20 `'no'`, 0 `NULL`), and 40 of the 83 participants already accepted on a session were not `'yes'` — existing accepted rows are left untouched, but those people cannot be re-invited or re-accepted until they confirm. |
| 2026-08-17 | Added `session_participants.struck_at` / `struck_by` — no-show strikes are now tied to the session they happened in (`20260817_session_strikes.sql`). `jury_participants.flag_count` stays as the counter driving the 3-strike auto-blacklist. Historical strikes (5 accounts, all 1/3) are attributed by `20260817_session_strikes_backfill.sql`, which only touches participants with exactly one invite so the attribution is forced rather than guessed. |
| 2026-05-22 | Dropped `profiles` table — unused (empty, no trigger); reads refactored to `auth.users` via `supabaseAdmin` |
| 2026-05-22 | Dropped `case_audit_logs` table — writes never read |
| 2026-05-22 | Dropped `profiles.role`, `profiles.provider` columns (before full table drop) |
| 2026-05-16 | Dropped `requestee_responses`, `transcript_orders` tables |
