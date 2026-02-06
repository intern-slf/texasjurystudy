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

// 1. Corrected interface to match all used properties
interface CaseDocument {
  id: string;
  file_name: string;
  file_url: string;
}

interface JuryCase {
  id: string;
  title: string;
  status: string;
  description: string;
  number_of_attendees: number;
  case_documents: CaseDocument[];
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  
  const { data: cases } = await supabase
    .from("cases")
    .select(`
      *,
      case_documents (
        id,
        file_name,
        file_url
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8 p-6">
      <section>
        <div className="flex justify-between items-center mb-6 px-2">
          <h2 className="text-2xl font-bold text-slate-800 border-l-4 border-blue-600 pl-4">
            Presenter Cases & Evidence
          </h2>
        </div>
        
        <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Case Title</TableHead>
                <TableHead className="font-bold text-slate-700">Status</TableHead>
                <TableHead className="font-bold text-slate-700">Attendees</TableHead>
                <TableHead className="font-bold text-slate-700">Case Documents</TableHead>
                <TableHead className="text-right font-bold text-slate-700">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 2. Fixed: Applied JuryCase type to 'c' to resolve ESLint errors */}
              {cases?.map((c: JuryCase) => (
                <TableRow key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium">
                    <Link 
                      href={`/dashboard/Admin/${c.id}`} 
                      className="text-blue-600 hover:text-blue-800 font-semibold"
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

                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {c.case_documents && c.case_documents.length > 0 ? (
                        c.case_documents.map((doc: CaseDocument) => (
                          <a 
                            key={doc.id}
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1"
                          >
                            <span className="text-slate-400">📄</span> {doc.file_name}
                          </a>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No documents</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <AdminScheduleModal 
                        caseId={c.id} 
                        currentTitle={c.title} 
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}