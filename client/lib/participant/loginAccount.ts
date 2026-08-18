import { supabaseAdmin } from "@/lib/supabase/admin";

/* =========================
   LOGIN ACCOUNT (auth.users) STATUS

   A participant takes part through their own login: the invite email's Accept
   link signs them in with a magic link, and accepting requires the DL + PayPal
   fields they fill in on the participant dashboard. That is why
   `session_participants.participant_id` has an FK onto `auth.users(id)`.

   So a `jury_participants` row whose `user_id` has no `auth.users` row can
   never be invited — the INSERT fails with FK 23503 on
   `session_participants_participant_id_fkey`. Those rows exist (profiles created
   by hand or by import that never became logins), and offering them is what made
   a whole invite batch fail: one un-invitable selection, zero invites sent.

   Enforced in two layers, both importing from here so the rule has one place:
     - the candidate lists          — never offer someone who cannot be invited
     - inviteParticipants           — authoritative; names them instead of
                                      letting the FK reject the insert

   auth.users is not reachable through PostgREST, so membership is read through
   the `jury_participants_without_login()` SQL function
   (supabase/migrations/20260819_jury_participants_without_login.sql). Until that
   migration is applied the RPC 404s, so the invite guard falls back to per-id
   auth lookups — see `getIdsWithoutLogin`.
========================= */

const RPC_NAME = "jury_participants_without_login";

/** Shown to the admin for a participant who has a profile but no login. */
export const NO_LOGIN_REASON =
  "no signed-up account for this participant (they have a profile but never created a login)";

/** Per-id auth lookups are one round trip each — only worth it for a selection. */
const MAX_FALLBACK_LOOKUPS = 60;

let rpcWarned = false;

/**
 * Every `jury_participants.user_id` with no `auth.users` row, via one RPC.
 *
 * Returns null — not an empty set — when the function is unavailable, so callers
 * can tell "nobody is missing a login" from "we could not find out".
 */
async function rpcIdsWithoutLogin(): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc(RPC_NAME);
    if (error) {
      if (!rpcWarned) {
        rpcWarned = true;
        console.warn(
          `[loginAccount] ${RPC_NAME}() is unavailable (${error.message}). ` +
          `Apply supabase/migrations/20260819_jury_participants_without_login.sql — ` +
          `until then, participants without a login can still be offered by the candidate lists.`
        );
      }
      return null;
    }

    // `returns setof uuid` comes back as a bare string array; be tolerant of the
    // row-object shape in case the function is ever widened to return columns.
    const rows = (data ?? []) as Array<string | Record<string, unknown>>;
    const ids = rows
      .map((r) =>
        typeof r === "string"
          ? r
          : ((r?.[RPC_NAME] ?? r?.user_id ?? null) as string | null)
      )
      .filter((id): id is string => Boolean(id));
    return new Set(ids);
  } catch (err) {
    if (!rpcWarned) {
      rpcWarned = true;
      console.warn(`[loginAccount] ${RPC_NAME}() call failed:`, err);
    }
    return null;
  }
}

/**
 * Which of `ids` have no `auth.users` row, one id at a time.
 *
 * Only a definitive "not found" counts as missing. At least one live auth row
 * answers `getUserById` with "Database error loading user", and treating that as
 * "no account" would block a real participant from being invited — so an
 * unreadable row is left alone and the FK stays as the final backstop.
 */
async function authLookupIdsWithoutLogin(ids: string[]): Promise<Set<string>> {
  const missing = new Set<string>();

  for (const id of ids) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data?.user) continue;

      const status = (error as { status?: number } | null)?.status;
      const message = error?.message ?? "";
      if (!error || status === 404 || /user not found/i.test(message)) {
        missing.add(id);
      } else {
        console.warn(
          `[loginAccount] Could not read the auth row for ${id} (${message}) — ` +
          `treating them as invitable.`
        );
      }
    } catch (err) {
      console.warn(`[loginAccount] auth lookup failed for ${id}:`, err);
    }
  }

  return missing;
}

/**
 * Which of `ids` cannot be invited because they have no login account.
 *
 * Never throws: a helper that cannot answer must not fail an invite. When
 * nothing can be determined the result is empty and the FK rejection handling in
 * `inviteParticipants` catches it instead.
 */
export async function getIdsWithoutLogin(ids: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (!unique.length) return new Set();

  const all = await rpcIdsWithoutLogin();
  if (all) return new Set(unique.filter((id) => all.has(id)));

  // No RPC. A selection is small enough to check one id at a time.
  if (unique.length > MAX_FALLBACK_LOOKUPS) {
    console.warn(
      `[loginAccount] Skipping the no-login check for ${unique.length} ids — ` +
      `too many for per-id auth lookups and ${RPC_NAME}() is unavailable.`
    );
    return new Set();
  }
  return authLookupIdsWithoutLogin(unique);
}

/**
 * Every participant who has no login account, for filtering candidate lists.
 *
 * Empty when it cannot be determined — a candidate list must not blank itself
 * over a missing helper. The invite guard is what actually holds the line.
 */
export async function getAllIdsWithoutLogin(): Promise<Set<string>> {
  return (await rpcIdsWithoutLogin()) ?? new Set();
}
