"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createReadUrl, createUploadUrl } from "@/lib/gcs/idDocuments";

// These actions are the ONLY way a browser gets an id-documents URL. GCS has no
// RLS, so the checks here replace the Supabase storage policies (owner ALL /
// admin SELECT / admin UPDATE — docs/rls-policies.md, storage section): a signed
// URL works for anyone who holds it, so nothing may be minted for the wrong
// caller. A "use server" export is a public endpoint — anyone signed in can call
// it with any arguments — hence every rule is enforced here, not in the pages.

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const NOT_ALLOWED = "You do not have access to this file.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Signed GET URL for an ID photo. Allowed for an admin, for anything in the
 * caller's own `<userId>/` folder, and for the exact path the caller's own
 * profile links (legacy rows can point outside the folder). Everyone else —
 * including requestee and firm roles — gets `{ error }`.
 */
export async function getIdPhotoReadUrl(
  path: string
): Promise<{ url: string } | { error: string }> {
  try {
    if (!path || path.includes("..") || path.startsWith("/") || path.includes("gs://")) {
      return { error: "Invalid file path." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You are not signed in." };

    if (path.startsWith(`${user.id}/`)) {
      return { url: await createReadUrl(path) };
    }

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleError) throw new Error(`roles lookup: ${roleError.message}`);
    if (roleRow?.role === "admin") {
      return { url: await createReadUrl(path) };
    }

    // The legacy rule covers old rows whose link sits outside the caller's
    // folder (e.g. bucket-root files from before per-user folders). The column
    // is participant-writable, so equality alone must never unlock a path in
    // ANOTHER user's folder — a caller could write that path into their own row.
    const firstSegment = path.split("/")[0];
    if (!(UUID_RE.test(firstSegment) && firstSegment !== user.id)) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("jury_participants")
        .select("driver_license_image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw new Error(`jury_participants lookup: ${profileError.message}`);
      if (profile?.driver_license_image_url && profile.driver_license_image_url === path) {
        return { url: await createReadUrl(path) };
      }
    }

    return { error: NOT_ALLOWED };
  } catch (err) {
    console.error("[getIdPhotoReadUrl] Failed:", err instanceof Error ? err.message : err);
    return { error: "Could not load the ID photo. Please try again." };
  }
}

/**
 * Signed PUT URL for a new ID photo. Allowed for the participant themselves and
 * for an admin uploading into a participant's folder (admin edit mode). The
 * object path is built here and returned — a caller-supplied path would let
 * anyone choose whose folder they write into.
 */
export async function getIdPhotoUploadUrl(opts: {
  targetUserId: string;
  fileExt: string;
  contentType: string;
}): Promise<{ url: string; path: string } | { error: string }> {
  try {
    const { targetUserId, fileExt, contentType } = opts;

    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      return { error: "Unsupported file type. Please upload a JPG, PNG, or WebP image." };
    }
    if (!contentType || !contentType.startsWith("image/")) {
      return { error: "Only image uploads are allowed." };
    }
    // The id becomes the folder segment of the object path, and the folder is
    // what the read/delete rules key on.
    if (!targetUserId || targetUserId.includes("/") || targetUserId.includes("..")) {
      return { error: "Invalid participant id." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You are not signed in." };

    if (user.id !== targetUserId) {
      const { data: roleRow, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleError) throw new Error(`roles lookup: ${roleError.message}`);
      if (roleRow?.role !== "admin") return { error: NOT_ALLOWED };
    }

    const path = `${targetUserId}/${Date.now()}-id.${fileExt}`;
    return { url: await createUploadUrl(path, contentType), path };
  } catch (err) {
    console.error("[getIdPhotoUploadUrl] Failed:", err instanceof Error ? err.message : err);
    return { error: "Could not start the upload. Please try again." };
  }
}
