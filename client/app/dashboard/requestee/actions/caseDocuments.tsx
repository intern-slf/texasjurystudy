// client/app/dashboard/requestee/actions/caseDocuments.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* =========================
   UPLOAD DOCUMENT
   ========================= */
export async function uploadCaseDocument(
  caseId: string,
  file: File,
  nameAttested: boolean
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // HIPAA: the requestee must attest they renamed the file (to strip any
  // patient/identifying info from the original file name) before uploading.
  // An unchanged file name is a compliance loophole, so block the upload and
  // record the attestation alongside the document.
  if (!nameAttested) {
    throw new Error("File-name attestation is required before uploading.");
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
      name_attested: true,
      name_attested_at: new Date().toISOString(),
    });

  if (insertError) {
    throw insertError;
  }

  revalidatePath(`/dashboard/requestee`);
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

  revalidatePath("/dashboard/requestee");
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
