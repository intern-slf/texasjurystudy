"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCaseDocumentUrl,
  deleteCaseDocument,
} from "@/app/dashboard/presenter/actions/caseDocuments";

type Props = {
  caseId: string;
};

type CaseDocument = {
  id: string;
  original_name: string;
  storage_path: string;
};

export default function CaseFiles({ caseId }: Props) {
  const supabase = createClient();
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchDocs() {
    const { data } = await supabase
      .from("case_documents")
      .select("id, original_name, storage_path")
      .eq("case_id", caseId)
      .order("created_at");

    setDocs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchDocs();
  }, [caseId]);

  async function open(doc: CaseDocument) {
    const url = await getCaseDocumentUrl(doc.storage_path);
    window.open(url, "_blank");
  }

  async function remove(doc: CaseDocument) {
    if (!confirm("Delete this file?")) return;

    await deleteCaseDocument(doc.id, doc.storage_path);
    await fetchDocs();
  }

  if (loading || docs.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground font-medium">
        Attached Documents
      </p>

      <ul className="space-y-1">
        {docs.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 text-sm border rounded px-3 py-1"
          >
            <span className="truncate flex-1">
              {doc.original_name}
            </span>

            <div className="flex gap-3">
              <button
                onClick={() => open(doc)}
                className="underline"
              >
                View
              </button>

              <button
                onClick={() => remove(doc)}
                className="text-destructive underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
