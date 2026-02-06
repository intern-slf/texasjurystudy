import { createClient } from "../../../lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { AdminScheduleModal } from "../../../components/AdminScheduleModal";
import Link from "next/link";

/* =========================
   TYPES
   ========================= */

interface CaseDocument {
  id: string;
  original_name: string;
  storage_path: string;
  signedUrl: string | null;
}

interface JuryCase {
  id: string;
  title: string;
  status: "current" | "previous";
  number_of_attendees: number;
  case_documents: CaseDocument[];
}

/* =========================
   PAGE
   ========================= */

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  /* =========================
     FETCH CASES + DOCUMENTS
     ========================= */

  const { data: rawCases } = await supabase
    .from("cases")
    .select(`
      id,
      title,
      status,
      number_of_attendees,
      case_documents (
        id,
        original_name,
        storage_path
      )
    `)
    .order("created_at", { ascending: false });

  /* =========================
     CREATE SIGNED URLs
     ========================= */

  const cases: JuryCase[] = await Promise.all(
    (rawCases ?? []).map(async (c) => {
      const docsWithUrls = await Promise.all(
        (c.case_documents ?? []).map(async (doc) => {
          const { data } = await supabase.storage
            .from("case-documents")
            .createSignedUrl(doc.storage_path, 60 * 10); // 10 minutes

          return {
            ...doc,
            signedUrl: data?.signedUrl ?? null,
          };
        })
      );

      return {
        ...c,
        case_documents: docsWithUrls,
      };
    })
  );

  /* =========================
     UI
     ========================= */

  return (
    <div className="space-y-8 p-6">
      <section>
        <div className="flex justify-between items-center mb-6 px-2">
          <h2 className="text-2xl font-bold text-slate-800 border-l-4 border-blue-600 pl-4">
            Presenter Cases & Documents
          </h2>
        </div>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Case Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attendees</TableHead>
                <TableHead>Respective Documents</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  {/* CASE TITLE */}
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/Admin/${c.id}`}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      {c.title}
                    </Link>
                  </TableCell>

                  {/* STATUS */}
                  <TableCell>
                    <span
                      className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium border ${
                        c.status === "current"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {c.status}
                    </span>
                  </TableCell>

                  {/* ATTENDEES */}
                  <TableCell>{c.number_of_attendees}</TableCell>

                  {/* DOCUMENTS */}
                  <TableCell>
                    <div className="flex flex-col gap-1 max-w-[220px]">
                      {c.case_documents.length ? (
                        c.case_documents.map((doc) =>
                          doc.signedUrl ? (
                            <a
                              key={doc.id}
                              href={doc.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline truncate"
                              title={doc.original_name}
                            >
                              📄 {doc.original_name}
                            </a>
                          ) : (
                            <span
                              key={doc.id}
                              className="text-xs text-red-400 italic"
                            >
                              Unable to load document
                            </span>
                          )
                        )
                      ) : (
                        <span className="text-xs italic text-slate-400">
                          No documents uploaded
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* MANAGE */}
                  <TableCell className="text-right">
                    <AdminScheduleModal
                      caseId={c.id}
                      currentTitle={c.title}
                    />
                  </TableCell>
                </TableRow>
              ))}

              {!cases.length && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-20 text-slate-400 italic"
                  >
                    No cases found.
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
