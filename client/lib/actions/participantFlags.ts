import { supabaseAdmin } from "@/lib/supabase/admin";
import { blacklistParticipant } from "@/lib/actions/adminParticipant";

// A participant who accepts a session invite and then backs out earns a "flag".
// Once they reach this many flags they're auto-blacklisted and can no longer be
// invited to any future session.
export const BACKOUT_FLAG_LIMIT = 3;

/**
 * Records a no-show / back-out strike against a participant **for one session**.
 *
 * The strike is stamped on that session's `session_participants` row, which is
 * what makes it visible per-session — the case page shows "Striked" instead of
 * "Confirmed" for anyone struck in a session that case ran in.
 * `jury_participants.flag_count` is then bumped as the running counter, and once
 * it reaches BACKOUT_FLAG_LIMIT the participant is auto-blacklisted via the
 * shared `blacklistParticipant` action (which sets both blacklist markers, so
 * every future-invite path excludes them automatically).
 *
 * Idempotent per session: striking the same participant twice for the same
 * session is a no-op, so a double-click can no longer inflate the counter. That
 * guard is only possible because the strike is now tied to a session.
 *
 * Uses the service-role client because there is no admin UPDATE RLS policy on
 * `jury_participants` (same reason the adminParticipant actions do). Only
 * jury_participants rows carry a counter — a legacy `oldData` participant still
 * gets the per-session strike recorded, but no count and no auto-blacklist,
 * since those columns exist only on jury_participants.
 *
 * This is a server-only helper invoked from other server actions (not called
 * directly from the client), so it deliberately does not carry a "use server"
 * directive — that lets it export the BACKOUT_FLAG_LIMIT constant.
 */
export async function recordBackoutStrike(
  participantId: string,
  sessionId: string,
  struckBy?: string
): Promise<void> {
  /* =========================
     LOCATE THE INVITE
     ========================= */
  const { data: invite, error: inviteErr } = await supabaseAdmin
    .from("session_participants")
    .select("id, struck_at")
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (inviteErr) {
    console.error(
      `[recordBackoutStrike] Failed to read invite for ${participantId} in session ${sessionId}:`,
      inviteErr.message
    );
    return;
  }

  if (!invite) {
    console.warn(
      `[recordBackoutStrike] ${participantId} has no invite for session ${sessionId} — nothing to strike.`
    );
    return;
  }

  if (invite.struck_at) {
    console.log(
      `[recordBackoutStrike] ${participantId} was already struck for session ${sessionId} at ${invite.struck_at} — skipping.`
    );
    return;
  }

  /* =========================
     STAMP THE STRIKE
     ========================= */
  const { error: strikeErr } = await supabaseAdmin
    .from("session_participants")
    .update({
      struck_at: new Date().toISOString(),
      ...(struckBy ? { struck_by: struckBy } : {}),
    })
    .eq("id", invite.id);

  if (strikeErr) {
    console.error(
      `[recordBackoutStrike] Failed to stamp strike for ${participantId} in session ${sessionId}:`,
      strikeErr.message
    );
    return;
  }

  /* =========================
     BUMP THE RUNNING COUNTER
     ========================= */
  const { data: row, error } = await supabaseAdmin
    .from("jury_participants")
    .select("flag_count")
    .eq("user_id", participantId)
    .maybeSingle();

  if (error) {
    console.error(
      `[recordBackoutStrike] Failed to read flag_count for ${participantId}:`,
      error.message
    );
    return;
  }

  // Not a jury_participants row (e.g. a legacy oldData id) — the session strike
  // is recorded, but there's no counter to bump and no blacklist to trigger.
  if (!row) {
    console.log(
      `[recordBackoutStrike] ${participantId} struck for session ${sessionId}; no jury_participants row, so no flag counted.`
    );
    return;
  }

  const newCount = (row.flag_count ?? 0) + 1;

  const { error: updateErr } = await supabaseAdmin
    .from("jury_participants")
    .update({ flag_count: newCount })
    .eq("user_id", participantId);

  if (updateErr) {
    console.error(
      `[recordBackoutStrike] Failed to update flag_count for ${participantId}:`,
      updateErr.message
    );
    return;
  }

  console.log(
    `[recordBackoutStrike] ${participantId} struck for session ${sessionId} — now has ${newCount} flag(s).`
  );

  if (newCount >= BACKOUT_FLAG_LIMIT) {
    await blacklistParticipant(
      participantId,
      `Auto-blacklisted: reached ${BACKOUT_FLAG_LIMIT} flags`
    );
  }
}
