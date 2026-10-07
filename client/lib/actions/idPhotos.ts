"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listIdPhotos, removeIdPhotos } from "@/lib/gcs/idDocuments";

// Both forms upload first and link the photo afterwards, so a fresh upload can belong to
// a save that hasn't landed yet (an admin and the participant, or two tabs, saving at
// once). Anything this young is left for a later save or scripts/cleanup-id-photos.mjs.
const RECENT_UPLOAD_MS = 10 * 60 * 1000;

/**
 * Deletes the ID images in a participant's folder that their profile no longer points at:
 * photos they (or an admin) have since replaced, and uploads left by signup attempts that
 * failed to save. Every upload gets a new timestamped name, so without this each
 * replacement leaves the old copy of someone's ID behind. Call it after a save succeeds.
 *
 * Runs with the app's GCS service account, which can delete anything in the bucket, so
 * the caller is checked here instead — the participant themselves, or an admin.
 *
 * Only files under "<userId>/" are touched: never the one the profile points at, nothing
 * uploaded in the last 10 minutes, and nothing at all while the profile has no photo
 * (the save may not have landed). Returns
 * how many files were removed. Never throws: a photo left behind can be cleaned up later,
 * so this must not fail a save that already succeeded.
 */
export async function removeReplacedIdPhotos(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !userId) return 0;

    if (user.id !== userId) {
      const { data: roleRow, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleError) throw new Error(`roles lookup: ${roleError.message}`);
      if (roleRow?.role !== "admin") return 0;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("jury_participants")
      .select("driver_license_image_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw new Error(`jury_participants lookup: ${profileError.message}`);
    const current = profile?.driver_license_image_url;
    if (!current) return 0;

    const files = await listIdPhotos(userId);

    // No upload time counts as recent.
    const now = Date.now();
    const stale = files
      .filter((file) => file.createdAt && now - new Date(file.createdAt).getTime() >= RECENT_UPLOAD_MS)
      .map((file) => file.path)
      .filter((path) => path !== current);
    if (stale.length === 0) return 0;

    await removeIdPhotos(stale);
    return stale.length;
  } catch (err) {
    console.error(
      `[removeReplacedIdPhotos] Failed to clean up ID photos for ${userId}:`,
      err instanceof Error ? err.message : err
    );
    return 0;
  }
}
