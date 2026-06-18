"use client";

import { getCaseDocumentUrl } from "@/app/dashboard/requestee/actions/caseDocuments";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadCaseDocument } from "@/app/dashboard/requestee/actions/caseDocuments";
import { deleteCaseDocument } from "@/app/dashboard/requestee/actions/caseDocuments";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  const [attested, setAttested] = useState(false);

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

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  function handleFiles(files: FileList | null) {
    if (!files) return;

    if (!attested) {
      alert(
        "Please confirm you have renamed the file before uploading.",
      );
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds the 100 MB limit.`);
        return;
      }
      startTransition(async () => {
        await uploadCaseDocument(caseId, file, attested);
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
      {/* File-name attestation (HIPAA) — must be checked before uploading */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
        <Checkbox
          id="nameAttest"
          checked={attested}
          onCheckedChange={(v) => setAttested(v === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="nameAttest"
          className="text-sm font-normal leading-snug text-amber-900"
        >
          I confirm I have <strong>renamed</strong> this file so that its file
          name contains no patient names, protected health information (PHI), or
          other personally identifying information. I understand this is
          required for HIPAA compliance.
        </Label>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (attested) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-md p-6 text-center ${
          dragging ? "border-primary" : "border-muted"
        } ${attested ? "" : "opacity-50"}`}
      >
        <input
          type="file"
          multiple
          hidden
          id="fileInput"
          disabled={!attested}
          onChange={(e) => handleFiles(e.target.files)}
        />

        <label
          htmlFor="fileInput"
          className={attested ? "cursor-pointer" : "cursor-not-allowed"}
        >
          <p className="font-medium">Drag & drop files</p>
          <p className="text-sm text-muted-foreground">
            {attested
              ? "or click to upload"
              : "Check the box above to enable uploading"}
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
