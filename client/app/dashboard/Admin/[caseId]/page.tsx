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

// Interface for Presenter Responses - Now correctly linked to CaseInfo
interface PresenterResponse {
  id: string;
  response_text: string;
  selected_juror_count: number;
  submitted_at: string;
}

// Main Case Interface to resolve ESLint and Type errors
interface CaseInfo {
  id: string;
  title: string;
  status: string;
  description: string;
  filters: {
    gender?: string;
  };
  presenter_responses: PresenterResponse[];
}

export default async function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const supabase = await createClient();

  // 1. Fetch case details with typed response casting
  const { data: caseInfo } = await supabase
    .from("cases")
    .select(`
      *,
      presenter_responses (
        id,
        response_text,
        selected_juror_count,
        submitted_at
      )
    `)
    .eq("id", params.caseId)
    .single() as { data: CaseInfo | null };

  // 2. Fetch specific documents
  const { data: caseDocs } = await supabase
    .from("case_documents")
    .select("*")
    .eq("case_id", params.caseId) as { data: CaseDocument[] | null };

  // 3. Matching logic for participants
  const { data: matchedUsers } = await supabase
    .from("jury_participants")
    .select("*")
    .eq("gender", caseInfo?.filters?.gender || "Male") as { data: JuryParticipant[] | null };

  return (
    <div className="max-w-5xl mx-auto space-y-10 p-6">
      {/* CASE HEADER & DESCRIPTION SECTION */}
      <section className="bg-white p-8 rounded-xl border shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">{caseInfo?.title}</h1>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-tight mt-1">
              Status: {caseInfo?.status}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">ID: {params.caseId}</span>
          </div>
        </div>
        <div className="border-t pt-4">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Complete Case Description</h3>
          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border italic">
            {caseInfo?.description || "No detailed description provided for this case."}
          </p>
        </div>
      </section>

      {/* PRESENTER RESPONSE SECTION */}
      <section className="bg-blue-50/50 p-8 rounded-xl border border-blue-100 space-y-4">
        <h3 className="text-xl font-bold text-blue-900">Presenter Feedback & Results</h3>
        {caseInfo?.presenter_responses?.[0] ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded border shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase">Selected Jurors</span>
              <p className="text-2xl font-black text-blue-600">{caseInfo.presenter_responses[0].selected_juror_count}</p>
            </div>
            <div className="bg-white p-4 rounded border shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase">Response Date</span>
              <p className="text-sm font-medium">
                {new Date(caseInfo.presenter_responses[0].submitted_at).toLocaleDateString()}
              </p>
            </div>
            <div className="md:col-span-2 bg-white p-4 rounded border shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase">Presenter Comments</span>
              <p className="text-slate-700 mt-2">{caseInfo.presenter_responses[0].response_text}</p>
            </div>
          </div>
        ) : (
          <p className="text-blue-400 italic">Waiting for presenter response...</p>
        )}
      </section>

      {/* CASE DOCUMENTS SECTION */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 px-2">Attached Evidence Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caseDocs?.map((doc) => (
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
              {matchedUsers?.map((p) => (
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