FocusGroup

FocusGroup is a role-based web platform designed to enable structured, demographic-driven focus group research.

The platform allows presenters to conduct controlled focus group sessions with carefully selected participants, while ensuring participants only engage through invitation-based access rather than open browsing.

Core Concept

FocusGroup operates on selection rather than discovery.

-> Participants do not browse or apply to focus groups.

-> Participants submit demographic information and wait to be shortlisted.

-> Presenters define requirements and explicitly select participants.

-> Access to live sessions is granted only after selection.

This approach preserves research quality and avoids self-selection bias.

User Roles

Participant

-> Completes demographic and screening forms using multiple-choice questions.

-> Cannot browse focus groups.

-> Waits to be selected for relevant sessions.

-> Gains access to a session only after invitation.

-> Sees profile status and selection notifications only.

Presenter

-> Completes a mandatory confidentiality acknowledgement.

-> After acknowledgement, lands on /dashboard/presenter.

-> Sees a dashboard with a sidebar containing three sections:

Presenter Dashboard Sections

Current

-> Displays currently active focus group cases.

-> Default selected view on dashboard load.

Previous
-> Displays completed or archived focus group cases.

New
-> Opens a case creation form.

Admin

-> Internal system role.

-> Not exposed in the user interface.

-> Manages moderation, role integrity, and platform health.

-> Cannot be selected during signup.

Authentication and Role Model

Authentication is handled using Supabase Auth.

-> Email confirmation is enabled.

-> Password reset is handled through a secure recovery flow.

-> No service role keys are exposed to the client.

Role Selection and Role Assignment

Role Selection (Before Signup)

-> Users choose either Participant or Presenter before signing up.

-> The selected role is passed through the signup URL, for example using a role query parameter.

-> This selection represents user intent only, not authority.

Role Assignment (After Signup)

Roles are not written directly from the frontend.

Instead, the following process is used:

-> The selected role is stored in auth.users raw user metadata during signup.

-> A PostgreSQL trigger runs after the user is created.

-> The trigger reads the role from metadata.

-> The trigger inserts a permanent role record into the roles table.

This design avoids race conditions with email confirmation, avoids RLS conflicts, prevents role spoofing, and keeps role authority strictly on the backend.

Roles cannot be changed by users after signup in the current design.

Acknowledgement Gate

The dashboard first presents a mandatory confidentiality acknowledgement form.

Users cannot access any dashboard functionality until the acknowledgement is completed.

The acknowledgement is stored separately for participants and presenters.

Once acknowledged, users are redirected to their role-specific dashboard.

The acknowledgement page is shown only once per user.

Case Creation (Presenter – New)

When a presenter selects New, a case creation form is displayed.

The form collects:

-> title
-> description
-> number_of_attendees (default: 10)
-> documentation_type (dropdown)

Participant Filter Configuration

The presenter defines participant filters.

All filters are stored as a single JSON object rather than individual database columns.

Filter fields include:

-> age
-> gender
-> race
-> county
-> availability_weekdays
-> availability_weekends
-> city
-> state
-> zip_code
-> country
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

These filters are evaluated against data from public.jury_participants.

Database Design

Roles Table

-> user_id: UUID, primary key, foreign key to auth.users.id

-> role: text value (participant, presenter, or admin)

-> created_at: timestamp

Purpose of the roles table:

-> Stores the authoritative role for each user.

-> Used for routing, permissions, and access control.

-> Enforces exactly one role per user.

Cases Table

A new table named cases stores presenter-created focus group cases.

The table includes:

-> presenter_id (UUID, foreign key to auth.users.id)
-> title
-> description
-> number_of_attendees
-> documentation_type
-> filters (JSON)
-> status (new, current, previous)
-> created_at
-> updated_at

All demographic and eligibility filters are stored inside the JSON filters column.

Role Assignment Trigger

-> Trigger runs on auth.users insert.

-> Reads role from raw user metadata.

-> Defaults to participant if no role is provided.

-> Inserts the role into the public roles table.

This ensures role assignment is secure, atomic, and not controlled by the frontend.

Tech Stack

Frontend

-> Next.js 16 using the App Router

-> TypeScript

-> Tailwind CSS

-> Server Components

-> Turbopack

Backend

-> Supabase

Deployment

-> Vercel

Project Structure

Application structure follows a role-based routing model.

-> Home page provides a static entry point.
-> Dashboard acts as a role router after acknowledgement.
-> Participant dashboard shows waiting and notification state.
-> Presenter dashboard provides case management via sidebar navigation.
-> Authentication routes handle login, signup, and password updates.

-> Supabase clients are separated for browser and server usage.

Routing Logic

The dashboard route acts as a role-based router after acknowledgement.

-> Participants are routed to the participant dashboard.
-> Presenters are routed to the presenter dashboard.

Participants do not see focus groups unless they are selected.

Presenters cannot create or manage focus groups until acknowledgement is completed.

Security Principles

-> Row Level Security is enabled on all public tables.

-> The frontend never inserts or updates role data.

-> Presenters have read-only access to participant demographic data.
-> No elevated or service keys are exposed to the browser.

-> Sensitive logic is handled using database triggers, server components, and middleware.

Email and Password Management

-> Email confirmation is required during signup.

-> Password reset is handled through Supabase recovery emails.

-> A custom password update page is used with recovery sessions.

Development Setup

Install dependencies using npm install.

Create a .env.local file inside the client directory and define the following environment variables:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Run the development server from the client directory using npm run dev.

License

This project is private and under active development.