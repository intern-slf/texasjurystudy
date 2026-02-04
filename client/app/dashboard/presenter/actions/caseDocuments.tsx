// client/app/dashboard/presenter/actions/caseDocuments.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* =========================
   UPLOAD DOCUMENT
   ========================= */
export async function uploadCaseDocument(
  caseId: string,
  file: File
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const fileExt = file.name.split(".").pop();
  const fileName = crypto.randomUUID();
  const storagePath = `${caseId}/${fileName}.${fileExt}`;

  /* Upload to Storage */
  const { error: uploadError } = await supabase.storage
    .from("case-documents")
    .upload(storagePath, file);

  if (uploadError) {
    throw uploadError;
  }

  /* Insert metadata */
  const { error: insertError } = await supabase
    .from("case_documents")
    .insert({
      case_id: caseId,
      uploaded_by: user.id,
      original_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
    });

  if (insertError) {
    throw insertError;
  }

  revalidatePath(`/dashboard/presenter`);
}
