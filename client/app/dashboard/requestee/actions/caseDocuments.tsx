// client/app/dashboard/requestee/actions/caseDocuments.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { ownsAllCases } from "@/lib/participant/requesteeAccess";
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

  // Only onto a case the caller created or is assigned to. Neither the
  // case_documents INSERT policy nor the storage policy looks at the case, so
  // without this any login could put a file on another firm's case, where admins
  // and the presenter email would take it for that firm's evidence.
  if (!(await ownsAllCases(user.id, [caseId]))) {
    throw new Error("Case not found or not owned by you");
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
    // Nothing points at the file without its row, so don't leave it in storage.
    await supabase.storage.from("case-documents").remove([storagePath]);
    throw insertError;
  }

  revalidatePath(`/dashboard/requestee`);
}

/* =========================
   DELETE DOCUMENT
   The browser names the document, never a path: the file removed is the one on
   the caller's own document row.
   ========================= */
export async function deleteCaseDocument(documentId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: doc, error: docError } = await supabase
    .from("case_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("uploaded_by", user.id)
    .maybeSingle();

  if (docError) throw docError;
  if (!doc) throw new Error("Document not found");

  // 1️⃣ Delete from storage
  const { error: storageError } = await supabase.storage
    .from("case-documents")
    .remove([doc.storage_path]);

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
   Signs only the file of a document on a case the caller owns, again named by
   the document rather than by a path.
   ========================= */
export async function getCaseDocumentUrl(documentId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: doc, error: docError } = await supabase
    .from("case_documents")
    .select("case_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) throw docError;
  if (!doc || !(await ownsAllCases(user.id, [doc.case_id]))) {
    throw new Error("Document not found");
  }

  const { data, error } = await supabase.storage
    .from("case-documents")
    .createSignedUrl(doc.storage_path, 60 * 5); // 5 minutes

  if (error) throw error;

  return data.signedUrl;
}
