"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateCaseFilters(caseId: string, filters: object) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Safety: block update if case is already scheduled for a session
  const { data: c } = await supabase
    .from("cases")
    .select("admin_scheduled_at")
    .eq("id", caseId)
    .eq("user_id", user.id)
    .single();

  if (!c) throw new Error("Case not found");
  if (c.admin_scheduled_at) throw new Error("Cannot edit filters after a session has been scheduled");

  await supabase
    .from("cases")
    .update({ filters })
    .eq("id", caseId)
    .eq("user_id", user.id);

  revalidatePath(`/dashboard/presenter/${caseId}`);
  revalidatePath("/dashboard/presenter");
}
