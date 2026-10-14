"use server";

import { createClient } from "@/lib/supabase/server";
import { ownsAllCases } from "@/lib/participant/requesteeAccess";
import { isHttpUrl } from "@/lib/httpUrl";
import { revalidatePath } from "next/cache";

export async function addDriveLink(caseId: string, url: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // A web link only: admins open it from the case page and the presenter email
  // carries it as a link.
  const link = typeof url === "string" ? url.trim() : "";
  if (!isHttpUrl(link)) throw new Error("Invalid URL");

  // Only on a case the caller created or is assigned to. The drive-link policy
  // only checks uploaded_by, so without this any login could attach a link to
  // another firm's case, which admins and the presenter email would take for
  // that firm's own and the firm itself couldn't remove.
  if (!(await ownsAllCases(user.id, [caseId]))) {
    throw new Error("Case not found or not owned by you");
  }

  const { error } = await supabase.from("case_drive_links").insert({
    case_id: caseId,
    uploaded_by: user.id,
    url: link,
  });

  if (error) throw error;
  revalidatePath("/dashboard/requestee");
}

export async function deleteDriveLink(linkId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("case_drive_links")
    .delete()
    .eq("id", linkId)
    .eq("uploaded_by", user.id);

  if (error) throw error;
  revalidatePath("/dashboard/requestee");
}
