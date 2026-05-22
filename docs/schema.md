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
  invite_status text,
  responded_at timestamp with time zone,
  CONSTRAINT session_participants_pkey PRIMARY KEY (id),
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
  participant_cap integer DEFAULT 10,
  session_full_notified boolean DEFAULT false,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
```

---

## Schema oddities worth tracking

These aren't bugs but they're surprises a future reader will hit:

1. **`session_participants_profiles_fkey`** — duplicate FK leftover from the dropped `profiles` table. Points to `auth.users(id)`, which is already covered by `session_participants_participant_id_fkey`. Safe to drop.
2. **`cases_presenter_id_fkey` / `cases_presenter_id_fkey1` / `confidentiality_agreements_presenter_user_id_fkey`** — leftover names from the presenter→requestee rename. Functional but misleading.
3. **`jury_participants_pkey PRIMARY KEY (id, email)`** — composite PK on `(id, email)` instead of just `id`. Unusual; means email changes require special handling. Both columns are already `UNIQUE` individually, so the composite adds nothing.
4. **`availability_weekdays`/`availability_weekends`** are `text` with `DEFAULT false` — a boolean default on a text column. Code stores `"Yes"`/`"No"`, so the default never matches what reads expect.
5. **`oldData`** uses CamelCase — requires quoting (`"oldData"`) in every raw SQL query.

---

## Recent cleanups

| Date | Change |
|------|--------|
| 2026-05-22 | Dropped `profiles` table — unused (empty, no trigger); reads refactored to `auth.users` via `supabaseAdmin` |
| 2026-05-22 | Dropped `case_audit_logs` table — writes never read |
| 2026-05-22 | Dropped `profiles.role`, `profiles.provider` columns (before full table drop) |
| 2026-05-16 | Dropped `requestee_responses`, `transcript_orders` tables |
