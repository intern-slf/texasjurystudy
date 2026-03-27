"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addDriveLink(caseId: string, url: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("case_drive_links").insert({
    case_id: caseId,
    uploaded_by: user.id,
    url: url.trim(),
  });

  if (error) throw error;
  revalidatePath("/dashboard/presenter");
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
  revalidatePath("/dashboard/presenter");
}
