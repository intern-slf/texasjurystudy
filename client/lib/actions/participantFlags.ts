import { supabaseAdmin } from "@/lib/supabase/admin";
import { blacklistParticipant } from "@/lib/actions/adminParticipant";

// A participant who accepts a session invite and then backs out earns a "flag".
// Once they reach this many flags they're auto-blacklisted and can no longer be
// invited to any future session.
export const BACKOUT_FLAG_LIMIT = 3;

/**
 * Records a no-show / back-out strike against a participant: increments their
 * `flag_count` and, once it reaches BACKOUT_FLAG_LIMIT, auto-blacklists them via
 * the shared `blacklistParticipant` action (which sets both blacklist markers,
 * so every future-invite path excludes them automatically).
 *
 * Uses the service-role client because there is no admin UPDATE RLS policy on
 * `jury_participants` (same reason the adminParticipant actions do). Only
 * jury_participants rows carry flags — legacy `oldData` ids are ignored.
 *
 * This is a server-only helper invoked from other server actions (not called
 * directly from the client), so it deliberately does not carry a "use server"
 * directive — that lets it export the BACKOUT_FLAG_LIMIT constant.
 */
export async function recordBackoutStrike(participantId: string): Promise<void> {
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

  // Not a jury_participants row (e.g. a legacy oldData id) — nothing to flag.
  if (!row) return;

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

  console.log(`[recordBackoutStrike] ${participantId} now has ${newCount} flag(s).`);

  if (newCount >= BACKOUT_FLAG_LIMIT) {
    await blacklistParticipant(
      participantId,
      `Auto-blacklisted: reached ${BACKOUT_FLAG_LIMIT} flags`
    );
  }
}
