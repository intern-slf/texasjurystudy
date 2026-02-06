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

export async function deleteCaseDocument(documentId: string, storagePath: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 1️⃣ Delete from storage
  const { error: storageError } = await supabase.storage
    .from("case-documents")
    .remove([storagePath]);

  if (storageError) throw storageError;

  // 2️⃣ Delete metadata
  const { error: dbError } = await supabase
    .from("case_documents")
    .delete()
    .eq("id", documentId)
    .eq("uploaded_by", user.id);

  if (dbError) throw dbError;

  revalidatePath("/dashboard/presenter");
}

/* =========================
   READ / DOWNLOAD DOCUMENT
   ========================= */
export async function getCaseDocumentUrl(storagePath: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase.storage
    .from("case-documents")
    .createSignedUrl(storagePath, 60 * 5); // 5 minutes

  if (error) throw error;

  return data.signedUrl;
}
