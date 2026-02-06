"use client";

import { getCaseDocumentUrl } from "@/app/dashboard/presenter/actions/caseDocuments";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadCaseDocument } from "@/app/dashboard/presenter/actions/caseDocuments";
import { deleteCaseDocument } from "@/app/dashboard/presenter/actions/caseDocuments";

type Props = {
  caseId: string;
};

type CaseDocument = {
  id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
};

export default function CaseDocumentUploader({ caseId }: Props) {
  const supabase = createClient();
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function fetchDocuments() {
    const { data } = await supabase
      .from("case_documents")
      .select("id, original_name, storage_path, mime_type")
      .eq("case_id", caseId)
      .order("created_at");

    setDocs(data || []);
  }

  useEffect(() => {
    fetchDocuments();
  }, [caseId]);

  function handleFiles(files: FileList | null) {
    if (!files) return;

    Array.from(files).forEach((file) => {
      startTransition(async () => {
        await uploadCaseDocument(caseId, file);
        await fetchDocuments();
      });
    });
  }

  async function remove(doc: CaseDocument) {
    if (!confirm("Delete this file?")) return;

    await deleteCaseDocument(doc.id, doc.storage_path);
    await fetchDocuments();
  }

  async function open(doc: CaseDocument) {
    const url = await getCaseDocumentUrl(doc.storage_path);
    window.open(url, "_blank");
  }


  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-md p-6 text-center ${
          dragging ? "border-primary" : "border-muted"
        }`}
      >
        <input
          type="file"
          multiple
          hidden
          id="fileInput"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <label htmlFor="fileInput" className="cursor-pointer">
          <p className="font-medium">Drag & drop files</p>
          <p className="text-sm text-muted-foreground">
            or click to upload
          </p>
        </label>

        {pending && <p className="text-sm mt-2">Uploading…</p>}
      </div>

      {/* Uploaded Files */}
      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-4 border rounded px-3 py-2"
            >
              <span className="text-sm truncate flex-1">
                {doc.original_name}
              </span>

              <div className="flex gap-3">
                <button
                  onClick={() => open(doc)}
                  className="text-sm underline"
                >
                  View
                </button>

                <button
                  onClick={() => remove(doc)}
                  className="text-sm text-destructive underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
