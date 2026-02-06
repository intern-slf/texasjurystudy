import { createClient } from "../../../lib/supabase/server";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
import { AdminScheduleModal } from "../../../components/AdminScheduleModal";
import Link from "next/link";

interface JuryCase {
  id: string;
  title: string;
  status: string;
  number_of_attendees: number;
  scheduled_at: string | null;
}

interface CaseDocument {
  id: string;
  file_name: string;
  file_url: string;
  case_id: string;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  
  // Fetch cases and documents from database
  const { data: cases } = await supabase
    .from("cases")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: documents } = await supabase
    .from("case_documents")
    .select("*");

  return (
    <div className="space-y-12">
      {/* SECTION: CASES */}
      <section>
        <h2 className="text-xl font-bold text-slate-800 mb-4 px-2 border-l-4 border-blue-600">Active Study Cases</h2>
        <div className="rounded-md border border-slate-200 bg-white">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Case Title</TableHead>
                <TableHead className="font-bold text-slate-700">Status</TableHead>
                <TableHead className="font-bold text-slate-700">Attendees</TableHead>
                <TableHead className="text-right font-bold text-slate-700">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases?.map((c: JuryCase) => (
                <TableRow key={c.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">
                    <Link 
                      href={`/dashboard/Admin/${c.id}`} 
                      className="text-blue-600 hover:text-blue-800 transition-colors font-semibold"
                    >
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={`capitalize px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      c.status === 'active' 
                        ? 'bg-green-50 text-green-700 border-green-200' 
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600 font-medium">
                    {c.number_of_attendees}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminScheduleModal 
                      caseId={c.id} 
                      currentTitle={c.title} 
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* SECTION: DOCUMENTS */}
      <section>
        <h2 className="text-xl font-bold text-slate-800 mb-4 px-2 border-l-4 border-slate-600">Global Document Repository</h2>
        <div className="rounded-md border border-slate-200 bg-white">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Document Name</TableHead>
                <TableHead className="text-right font-bold text-slate-700">Options</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents?.map((doc: CaseDocument) => (
                <TableRow key={doc.id}>
                  <TableCell className="text-slate-700 font-medium">{doc.file_name}</TableCell>
                  <TableCell className="text-right">
                    <a 
                      href={doc.file_url} 
                      target="_blank" 
                      className="text-sm font-bold text-blue-600 hover:underline"
                    >
                      View Document
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {(!documents || documents.length === 0) && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-10 text-slate-400">
                    No documents uploaded yet.
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