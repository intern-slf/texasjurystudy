---
name: magic-link-auth-model
description: How participant magic-link auth works and its key security weaknesses
metadata:
  type: project
---

Participant "magic link" = two chained tokens. Outer: HMAC-SHA256 token (lib/emailActionToken.ts, lib/reactivationToken.ts) in emails to /api/email-action (7d) and /api/email-action/reactivate (30d). On hit, server calls `supabaseAdmin.auth.admin.generateLink({type:"magiclink"})` and returns a real Supabase login link to /auth/confirm (verifyOtp → logged-in session, no password). So the endpoint is effectively a login-link vending machine keyed by the outer token.

Security findings (reviewed 2026-05-30):
- HMAC impl is solid (timingSafeEqual, exp, action bound) — tokens can't be forged without EMAIL_ACTION_SECRET. That single static secret leaking = takeover of any account (reactivation payload is just {participantId=user_id UUID, action, exp}; UUIDs aren't secret).
- Outer token is long-lived + NOT single-use; token sits in URL query string (leaks via logs/referer/scanners/forwarded mail). reactivate `edit` 302-redirects straight into a session.
- State-changing actions are bare GETs → email link scanners can auto-accept/decline and burn the one-time magic link.
- /auth/confirm `next` param is unvalidated → open redirect.
- Cross-account: RLS blocks reading/overwriting another participant's jury_participants row. BUT invite RSVP is an IDOR — /dashboard/participant?inviteId=X&status=Y calls updateInviteStatus() (service-role, RLS-bypass) with no ownership check vs auth.uid(). jury_participants UPDATE is row- but not column-scoped (open audit items F14/F19) → participant can self-set approved_by_admin / clear blacklist on own row.
- UNVERIFIED: `id-documents` Storage bucket policy is NOT in [[docs-rls-policies]] (only tables audited). If not folder-scoped to auth.uid(), participants could read each other's driver-license images.
