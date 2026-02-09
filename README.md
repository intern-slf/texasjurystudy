FocusGroup

FocusGroup is a role-based web platform designed to enable structured, demographic-driven focus group research.

The platform prioritizes selection over discovery, ensuring participants are chosen deliberately based on defined criteria rather than self-applying, thereby preserving research quality and reducing bias.

Core Concept

FocusGroup operates on selection rather than discovery.

-> Participants do not browse or apply to focus groups
-> Participants submit demographic information and wait to be shortlisted
-> Presenters define requirements and create cases
-> Participants wait in a “Waiting for selection” state
-> Access is granted only after explicit selection
-> Unselected cases are never visible to participants

This model avoids self-selection bias and supports controlled research workflows.

User Roles
Participant

-> Completes a structured demographic and screening form
-> Cannot browse, search, or apply to focus groups
-> Sees a default “Waiting for selection” state
-> Gains access only after being selected into a case
-> Does not see unselected or rejected cases

Presenter

-> Completes a mandatory confidentiality acknowledgement
-> Is redirected to /dashboard/presenter after acknowledgement
-> Manages focus group cases via a sidebar-based dashboard
-> Defines participant requirements and uploads case documents
-> Can manually archive cases

Presenter Dashboard Sections

Current

-> Displays active focus group cases
-> Includes scheduled and unscheduled cases
-> Default dashboard view

Previous

-> Displays expired, completed, or archived cases
-> Includes cases automatically moved after schedule expiry
-> Includes cases manually archived by presenter or admin

New

-> Opens the case creation flow

Admin

-> Not exposed in the UI
-> Handles moderation, screening, and lifecycle overrides
-> Selects participants into cases
-> Can select participants outside presenter-defined filters
-> Cannot edit presenter-defined filters
-> Can archive and restore cases
-> Cannot impersonate presenters
-> Cannot be selected during signup

Authentication and Role Model

Authentication is handled using Supabase Auth.

-> Email confirmation enabled
-> Secure password recovery supported
-> No service-role or elevated keys exposed to the client

Role Selection (Before Signup)

-> User selects Participant or Presenter before signup
-> Role is passed via signup URL (intent only)

Role Assignment (After Signup)

-> Role is stored in auth.users raw metadata
-> PostgreSQL trigger runs on user creation
-> Trigger inserts authoritative role into public.roles

the following process is used:

-> The selected role is stored in auth.users raw user metadata during signup.
-> A PostgreSQL trigger runs after the user is created.
-> The trigger reads the role from metadata.
-> The trigger inserts a permanent role record into the roles table.

Roles cannot be changed after signup.

Acknowledgement Gate

-> Mandatory confidentiality acknowledgement
-> Blocks dashboard access until accepted
-> Explicit “I agree” action required
-> Stored separately per role
-> Shown only once per user
-> Cannot be reset by admin

Case Creation (Presenter – New)

When a presenter selects New, a case creation form is displayed.

Collected fields:

-> title
-> description
-> number_of_attendees (default: 10)
-> scheduled_at (optional)

Notes:

-> Cases may exist without a schedule
-> Unscheduled cases remain current indefinitely
-> Presenters may add scheduled_at later
-> Removing scheduled_at reverts the case to unscheduled
-> Scheduled time represents intended session time

Participant Filter Configuration

Presenters define participant requirements.

-> All filters are stored as a single structured JSON object
-> Stored in cases.filters (JSONB)

Filter fields include:

-> age
-> gender
-> race
-> city
-> county
-> state
-> zip_code
-> country
-> availability_weekdays
-> availability_weekends
-> served_on_jury
-> convicted_felon
-> us_citizen
-> has_children
-> served_armed_forces
-> currently_employed
-> internet_access
-> marital_status
-> political_affiliation
-> education_level
-> industry
-> family_income

Filter semantics:

-> Some filters act as hard requirements
-> Partial matches remain visible but ranked lower (admin view)

Case Lifecycle

Cases exist in one of two states:

-> current
-> previous

Lifecycle transitions are system-governed, not client-controlled.

Lifecycle Rules

-> Unscheduled cases remain current indefinitely
-> Scheduled cases remain current until expiry
-> Scheduled cases automatically move to previous 60 minutes after scheduled_at
-> Expiry is calculated using UTC stored time only
-> Presenter can manually archive a case
-> Admin can archive or restore cases

Important clarification:

-> A case’s database status may remain current
-> UI may still display the case under “Previous”
-> This UI-level interpretation is intentional and long-term

Documents & Storage

-> Case-specific documents are supported
-> Stored under case-documents/{case_id}/{uuid}.{ext}
-> Presenters can upload, delete, and replace documents freely
-> Download-only access
-> Participant access is future-scoped

Future behavior (not implemented):

-> Documents will be frozen once a case moves to previous
-> Admins will have write access to case documents

Participant Visibility (Future)

Not yet implemented.

Planned behavior:

-> Participants see a list of all cases they were selected for historically
-> Case details include name, description, and schedule
-> Documents are not visible to participants
-> Deselected cases disappear entirely from participant dashboard

Database Design
Roles Table (public.roles)

-> user_id (UUID, PK, FK to auth.users)
-> role (participant | presenter | admin)
-> created_at

Purpose:

-> Single source of truth for roles
-> Enforces exactly one role per user

Cases Table (public.cases)

Stores presenter-created focus group cases.

Includes:

-> user_id (presenter)
-> title
-> description
-> number_of_attendees
-> documentation_type
-> filters (JSONB)
-> scheduled_at
-> status (current, previous)
-> created_at
-> updated_at

All demographic and eligibility filters are stored inside the JSON filters column.

Role Assignment Trigger

-> Trigger runs on auth.users insert.
-> Reads role from raw user metadata.
-> Defaults to participant if no role is provided.
-> Inserts the role into the public roles table.

This ensures role assignment is secure, atomic, and not frontend-controlled.

Tech Stack
Frontend

-> Next.js 16 (App Router)
-> TypeScript
-> Tailwind CSS
-> shadcn/ui (Component Library)
-> Lucide React (Icons)
-> Server Components
-> Turbopack

Backend

-> Supabase
-> Resend (Email Infrastructure)

Deployment

-> Vercel

Routing Logic

-> Home page is a static entry point
-> Dashboard acts as a role-based router
-> Acknowledgement gate enforced before routing

Routing behavior:

-> Participants routed to participant dashboard
-> Presenters routed to presenter dashboard

Participants never see focus groups unless selected.

Security Principles

-> Row Level Security enabled on all public tables
-> Frontend never inserts or updates roles
-> Presenters have read-only access to participant demographics
-> Lifecycle transitions handled server-side
-> No elevated keys exposed to browser
-> Sensitive logic handled via triggers, server actions, and middleware

Email and Password Management

-> Email confirmation required
-> Password reset via Supabase recovery
-> Custom password update page supported
-> Case approval notifications (via Resend)

Development Setup

The Next.js application is located in the `client` directory.

1. Install dependencies:

   cd client
   npm install

2. Create .env.local inside the client directory:

   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
   RESEND_API_KEY=your_resend_api_key (Optional, for emails)
   NEXT_PUBLIC_APP_URL=http://localhost:3000

3. Run development server:

   npm run dev

Future Features (Not Yet Implemented)

-> Participant sees selected case details (name, description, schedule)
-> Soft-preference ranking instead of hard filters
-> Admin-driven screening and ranking pipeline
-> Presenter reordering and swapping participants
-> Waitlists and backup participants
-> Participant profile editing (affects future cases only)
-> Email + dashboard notifications
-> Document access for participants post-selection
-> Legally binding acknowledgement language

License

This project is private and under active development.