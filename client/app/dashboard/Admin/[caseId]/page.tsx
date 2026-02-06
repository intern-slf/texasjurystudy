import { createClient } from "../../../../lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";

// Interfaces for type safety
interface JuryParticipant {
  id: string;
  first_name: string;
  last_name: string;
  city: string;
  county: string;
  political_affiliation: string;
  education_level: string;
  gender: string;
}

interface CaseDocument {
  id: string;
  file_name: string;
  file_url: string;
}

export default async function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const supabase = await createClient();

  // 1. Fetch complete case details
  const { data: caseInfo } = await supabase
    .from("cases")
    .select("*")
    .eq("id", params.caseId)
    .single();

  // 2. Fetch specific documents for this case
  const { data: caseDocs } = await supabase
    .from("case_documents")
    .select("*")
    .eq("case_id", params.caseId);

  // 3. Keep original matching logic for participants
  const { data: matchedUsers } = await supabase
    .from("jury_participants")
    .select("*")
    .eq("gender", caseInfo?.filters?.gender || "Male") as { data: JuryParticipant[] | null };

  return (
    <div className="max-w-5xl mx-auto space-y-10 p-6">
      {/* CASE HEADER & DESCRIPTION SECTION */}
      <section className="bg-white p-8 rounded-xl border shadow-sm space-y-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">{caseInfo?.title}</h1>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-tight mt-1">
            Status: {caseInfo?.status}
          </p>
        </div>
        <div className="border-t pt-4">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Complete Case Description</h3>
          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border italic">
            {caseInfo?.description || "No detailed description provided for this case."}
          </p>
        </div>
      </section>

      {/* CASE DOCUMENTS SECTION */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 px-2">Attached Evidence Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caseDocs?.map((doc: CaseDocument) => (
            <div key={doc.id} className="flex items-center justify-between p-4 bg-white border rounded-lg hover:border-blue-400 transition-colors">
              <span className="text-sm font-semibold text-slate-700 truncate mr-4">{doc.file_name}</span>
              <a 
                href={doc.file_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-slate-900 text-white px-4 py-2 rounded text-xs font-bold hover:bg-slate-700"
              >
                View PDF
              </a>
            </div>
          ))}
          {(!caseDocs || caseDocs.length === 0) && (
            <p className="text-slate-400 italic px-2">No documents attached to this case.</p>
          )}
        </div>
      </section>

      {/* SYSTEM-MATCHED PARTICIPANTS SECTION */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 px-2">System-Matched Participants</h3>
        <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-900">Full Name</TableHead>
                <TableHead className="font-semibold text-slate-900">Location</TableHead>
                <TableHead className="font-semibold text-slate-900">Politics</TableHead>
                <TableHead className="font-semibold text-slate-900">Education</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matchedUsers?.map((p: JuryParticipant) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">{p.first_name} {p.last_name}</TableCell>
                  <TableCell>{p.city}, {p.county}</TableCell>
                  <TableCell>{p.political_affiliation}</TableCell>
                  <TableCell>{p.education_level}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}