import { supabaseAdmin } from "@/lib/supabase/admin";

/* =========================
   ACTIVE PANEL STATUS
   A participant may only attend a session while they are an *active* panel
   member — the "Active" column in the admin participants table, which reads
   `jury_participants.reactivation_status` (set by the "are you still
   interested?" campaign). Only an explicit "yes" counts; "pending", "no" and
   NULL all mean we have no current confirmation that they still participate.

   Enforced in three places, all of which import from here so the rule has one
   definition:
     - inviteParticipants      — non-active participants are never invited
     - updateInviteStatus      — a non-active participant cannot accept
     - adminRespondOnBehalf    — an admin cannot accept on their behalf either
========================= */

/** The single `reactivation_status` value that counts as active. */
export const ACTIVE_STATUS = "yes";

export function isActiveStatus(status: string | null | undefined): boolean {
  return status === ACTIVE_STATUS;
}

/**
 * Which of `ids` are NOT active, and so must not be invited or accepted.
 *
 * Read with the service role so RLS can't make the guard silently pass — same
 * reasoning as the blacklist guard in `inviteParticipants`.
 *
 * Only ids with a readable `jury_participants` row are judged. A missing row
 * means there is no `reactivation_status` to test at all: that is the legacy
 * `oldData` mode, where every other modern filter (cooldown, approval,
 * blacklist) is skipped too. It cannot happen for a real invite in production —
 * `session_participants.participant_id` has an FK onto
 * `jury_participants.user_id`.
 */
export async function getInactiveParticipantIds(ids: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (!unique.length) return new Set();

  const { data, error } = await supabaseAdmin
    .from("jury_participants")
    .select("user_id, reactivation_status")
    .in("user_id", unique);

  if (error) {
    throw new Error(`[activeStatus] Could not read reactivation_status: ${error.message}`);
  }

  return new Set(
    (data ?? [])
      .filter((r) => !isActiveStatus(r.reactivation_status as string | null))
      .map((r) => r.user_id as string)
  );
}

export async function isParticipantActive(participantId: string): Promise<boolean> {
  const inactive = await getInactiveParticipantIds([participantId]);
  return !inactive.has(participantId);
}