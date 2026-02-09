import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { applyCaseFilters, CaseFilters } from "@/lib/filter-utils";

/* =========================
   DB ROW TYPES
   ========================= */

interface CaseDocumentRow {
  id: string;
  original_name: string;
  storage_path: string;
}

interface JuryParticipant {
  id: string;
  first_name: string;
  last_name: string;
  city: string;
  state: string;
  education_level: string;
  political_affiliation: string;
  gender: string;
  age: number;
}

/* =========================
   UI TYPES
   ========================= */

interface CaseDocument extends CaseDocumentRow {
  signedUrl: string | null;
}

interface CaseInfo {
  id: string;
  title: string;
  status: string;
  description: string;
  filters: CaseFilters;
  case_documents: CaseDocument[];
}

/* =========================
   PAGE
   ========================= */

export default async function AdminCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const supabase = await createClient();
  const { caseId } = await params;

  /* =========================
     FETCH CASE
     ========================= */

  const { data: rawCase } = await supabase
    .from("cases")
    .select(`
      id,
      title,
      status,
      description,
      filters,
      case_documents (
        id,
        original_name,
        storage_path
      )
    `)
    .eq("id", caseId)
    .single();

  if (!rawCase) {
    return (
      <p className="text-center text-slate-400 mt-20">
        Case not found.
      </p>
    );
  }

  /* =========================
     SIGNED DOCUMENT URLS
     ========================= */

  const case_documents: CaseDocument[] = await Promise.all(
    (rawCase.case_documents ?? []).map(async (doc: CaseDocumentRow) => {
      const { data } = await supabase.storage
        .from("case-documents")
        .createSignedUrl(doc.storage_path, 600);

      return {
        ...doc,
        signedUrl: data?.signedUrl ?? null,
      };
    })
  );

  const caseInfo: CaseInfo = {
    ...rawCase,
    case_documents,
  };

  /* =========================
     BUILD PARTICIPANT QUERY
     ========================= */

  let participantQuery = supabase
    .from("jury_participants")
    .select("*");

  // Apply filters using shared utility
  participantQuery = applyCaseFilters(participantQuery, caseInfo.filters);

  const { data: participants } = await participantQuery;

  /* =========================
     UI
     ========================= */

  return (
    <div className="max-w-6xl mx-auto space-y-10 p-6">
      {/* CASE INFO */}
      <section className="bg-white p-8 rounded-xl border shadow-sm">
        <h1 className="text-3xl font-extrabold">{caseInfo.title}</h1>
        <p className="text-sm font-bold text-blue-600 mt-1">
          Status: {caseInfo.status}
        </p>

        <p className="mt-6 bg-slate-50 p-4 rounded border italic">
          {caseInfo.description}
        </p>
      </section>

      {/* DOCUMENTS */}
      <section>
        <h3 className="text-xl font-bold mb-4">Evidence</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caseInfo.case_documents.map((doc) =>
            doc.signedUrl ? (
              <a
                key={doc.id}
                href={doc.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white p-4 border rounded shadow-sm hover:underline"
              >
                📄 {doc.original_name}
              </a>
            ) : null
          )}
        </div>
      </section>

      {/* PARTICIPANTS */}
      <section>
        <h3 className="text-xl font-bold mb-4">
          Matched Participants
        </h3>

        <div className="rounded-md border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Education</TableHead>
                <TableHead>Politics</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {participants?.length ? (
                participants.map((p: JuryParticipant) => (
                  <TableRow key={p.id} className="hover:bg-slate-50">
                    <TableCell>
                      <a
                        href={`/dashboard/participant/${p.id}?from=case&caseId=${caseId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {p.first_name} {p.last_name}
                      </a>
                    </TableCell>
                    <TableCell>
                      {p.city}, {p.state}
                    </TableCell>
                    <TableCell>{p.education_level}</TableCell>
                    <TableCell>{p.political_affiliation}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-slate-400 italic py-10"
                  >
                    No matching participants found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
