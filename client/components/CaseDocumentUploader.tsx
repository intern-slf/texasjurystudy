"use client";

import { useState, useTransition } from "react";
import { uploadCaseDocument } from "../app/dashboard/presenter/actions/caseDocuments";

type Props = {
  caseId: string;
};

export default function CaseDocumentUploader({ caseId }: Props) {
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleFiles(files: FileList | null) {
    if (!files) return;

    Array.from(files).forEach((file) => {
      startTransition(async () => {
        await uploadCaseDocument(caseId, file);
      });
    });
  }

  return (
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
        <p className="font-medium">
          Drag & drop documents here
        </p>
        <p className="text-sm text-muted-foreground">
          or click to upload
        </p>
      </label>

      {pending && (
        <p className="text-sm mt-2">Uploading…</p>
      )}
    </div>
  );
}
