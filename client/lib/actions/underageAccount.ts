"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listIdPhotos, removeIdPhotos } from "@/lib/gcs/idDocuments";
import { isUnderage, UNDERAGE_MESSAGE } from "@/lib/age-gate";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";

export type UnderageAccountResult =
  | { deleted: true }
  // No error only when the server's clock doesn't make them under 18 — the evening before
  // an 18th birthday in Texas is already the birthday in UTC. Callers still don't save.
  | { deleted: false; error?: string };

/**
 * Permanently deletes the signed-in participant's account, and everything stored about
 * them, when the date of birth they just entered puts them under 18.
 *
 * Deleting rather than just refusing the date: once someone tells us they're a minor we
 * have actual knowledge of it (COPPA, for under 13), and every piece of their data we keep
 * from then on is the problem — the login email, name, signature, ID image. Refusing the
 * date would leave all of that behind.
 *
 * Takes the date rather than a user id, so a caller can only ever delete their own
 * account, and re-checks it here so a client bug can't delete an adult. The date itself is
 * never stored.
 *
 * Admins and requestees are refused: neither enters a date of birth after signup (where an
 * under-18 date is rejected before any account exists), and a requestee's cases are tied
 * to sessions other people are in, so there is no "just their data" to remove.
 *
 * Blacklisted participants are refused too, and asked to email us (F27 in
 * docs/rls-policies.md). Deleting them would erase the blacklist, their strikes and the
 * login, so they could sign up again with the same email as someone new; Privacy §10
 * promises we keep a minimal note of accounts removed for conduct reasons. An admin closes
 * the account by hand and keeps that note. Either marker is enough, roles or blacklisted_at
 * (the only one a legacy participant with no roles row has): a wrong refusal costs them an
 * email, but a wrong delete can't be undone.
 */
export async function deleteAccountIfUnderage(
  dateOfBirth: string
): Promise<UnderageAccountResult> {
  if (!isUnderage(dateOfBirth)) return { deleted: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { deleted: false, error: "You are not signed in." };

  try {
    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleError) throw new Error(`roles lookup: ${roleError.message}`);

    // A missing roles row is a legacy participant, not a reason to keep their data.
    if (roleRow?.role === "admin" || roleRow?.role === "requestee") {
      return { deleted: false, error: UNDERAGE_MESSAGE };
    }

    // A failed read throws rather than counting as "not blacklisted".
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("jury_participants")
      .select("blacklisted_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(`jury_participants lookup: ${profileError.message}`);

    if (roleRow?.role === "blacklisted" || profile?.blacklisted_at) {
      // The id (never the DOB), so an admin can match it to the email that should follow.
      console.warn(`[deleteAccountIfUnderage] Refused: ${user.id} is blacklisted.`);
      return {
        deleted: false,
        error: `${UNDERAGE_MESSAGE} To close your account, please email ${SUPPORT_EMAIL}.`,
      };
    }

    await deleteParticipantData(user.id);
    return { deleted: true };
  } catch (err) {
    // The id (never the DOB) so an admin can finish the job by hand if a retry can't.
    console.error(
      `[deleteAccountIfUnderage] Failed to delete underage account ${user.id}:`,
      err instanceof Error ? err.message : err
    );
    return {
      deleted: false,
      error: `${UNDERAGE_MESSAGE} We couldn't finish deleting your account — please contact us.`,
    };
  }
}

/**
 * Every deletion is idempotent, and the auth user goes last: if a step fails the login
 * still exists, so the person can't carry on but a retry can finish the job.
 */
async function deleteParticipantData(userId: string) {
  // ID images. Uploads go under "<userId>/"; the prefix listing finds them all. The path
  // the profile points at is removed only when it is inside that folder too: the
  // participant can write that column from the browser, and the GCS service account can
  // delete anything, so a link into someone else's folder must not delete their photo. A
  // link outside the folder (an older upload) is logged for an admin to remove by hand.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("jury_participants")
    .select("driver_license_image_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`jury_participants lookup: ${profileError.message}`);

  const files = await listIdPhotos(userId);

  const paths = new Set(files.map((f) => f.path));
  const linked = profile?.driver_license_image_url;
  if (linked?.startsWith(`${userId}/`) && !linked.includes("..")) {
    paths.add(linked);
  } else if (linked) {
    console.warn(`[deleteAccountIfUnderage] ${userId}: ID photo outside their folder left for an admin.`);
  }
  if (paths.size > 0) {
    await removeIdPhotos([...paths]);
  }

  // Children first: session_participants FKs onto jury_participants(user_id), and these
  // all FK onto auth.users with no ON DELETE CASCADE.
  const rows: Array<[table: string, column: string]> = [
    ["session_participants", "participant_id"],
    ["jury_participants", "user_id"],
    ["confidentiality_agreements", "user_id"],
    ["roles", "user_id"],
  ];
  for (const [table, column] of rows) {
    const { error } = await supabaseAdmin.from(table).delete().eq(column, userId);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }

  // Hard delete (shouldSoftDelete defaults to false), which also ends their sessions.
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`auth user delete: ${authError.message}`);
}
