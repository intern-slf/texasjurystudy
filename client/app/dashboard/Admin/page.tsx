import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { sendApprovalEmail } from "@/lib/mail";
import { AdminActionButton } from "@/components/AdminActionButton";

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
  admin_status: "all" | "approved" | "submitted";
  number_of_attendees: number;
  case_documents: CaseDocument[];
}

type AdminTab = "all" | "approved" | "submitted";

/* =========================
   SERVER ACTIONS
   ========================= */

async function approveCase(formData: FormData) {
  "use server";
  const caseId = formData.get("caseId") as string;
  const supabase = await createClient();

  // 1. Update status and fetch case/presenter details
  const { data: updatedCase } = await supabase
    .from("cases")
    .update({ admin_status: "approved" })
    .eq("id", caseId)
    .select('title, user_id')
    .single();

  if (updatedCase) {
    // 2. Fetch presenter email from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", updatedCase.user_id)
      .single();

    if (profile?.email) {
      // 3. Trigger notification
      await sendApprovalEmail(profile.email, updatedCase.title);
    }
  }

  revalidatePath("/dashboard/Admin");
}

async function submitCase(formData: FormData) {
  "use server";
  const caseId = formData.get("caseId") as string;
  const supabase = await createClient();

  await supabase
    .from("cases")
    .update({ admin_status: "submitted" })
    .eq("id", caseId);

  revalidatePath("/dashboard/Admin");
}

/* =========================
   PAGE
   ========================= */

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: AdminTab }>;
}) {
  const supabase = await createClient();
  
  const resolvedParams = await searchParams;
  const tab: AdminTab = resolvedParams?.tab ?? "all";

  /* =========================
      FETCH CASES BY TAB
     ========================= */

  const { data: rawCases } = await supabase
    .from("cases")
    .select(`
      id,
      title,
      status,
      admin_status,
      number_of_attendees,
      case_documents (
        id,
        original_name,
        storage_path
      )
    `)
    .eq("admin_status", tab)
    .order("created_at", { ascending: false });

  /* =========================
      SIGNED URLS
     ========================= */

  const cases: JuryCase[] = await Promise.all(
    (rawCases ?? []).map(async (c) => {
      const docsWithUrls = await Promise.all(
        (c.case_documents ?? []).map(async (doc) => {
          const { data } = await supabase.storage
            .from("case-documents")
            .createSignedUrl(doc.storage_path, 600);

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

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">
        {tab === "all" && "All Cases"}
        {tab === "approved" && "Approved Cases"}
        {tab === "submitted" && "Submitted Cases"}
      </h2>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attendees</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-slate-900">
                  <Link
                    href={`/dashboard/Admin/${c.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {c.title}
                  </Link>
                </TableCell>

                <TableCell>
                  <span className="capitalize text-xs font-semibold px-2 py-1 bg-slate-100 rounded">
                    {c.status}
                  </span>
                </TableCell>

                <TableCell className="text-slate-600">{c.number_of_attendees}</TableCell>

                <TableCell>
                  {c.case_documents.length ? (
                    c.case_documents.map((doc) =>
                      doc.signedUrl ? (
                        <a
                          key={doc.id}
                          href={doc.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                        >
                          📄 {doc.original_name}
                        </a>
                      ) : null
                    )
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      No documents
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end">
                    {tab === "all" && (
                      <form action={approveCase}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <AdminActionButton 
                          label="Approve" 
                          activeColor="bg-green-600" 
                          hoverColor="hover:bg-green-700" 
                        />
                      </form>
                    )}

                    {tab === "approved" && (
                      <form action={submitCase}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <AdminActionButton 
                          label="Submit" 
                          activeColor="bg-blue-600" 
                          hoverColor="hover:bg-blue-700" 
                        />
                      </form>
                    )}

                    {tab === "submitted" && (
                      <span className="text-xs text-slate-400 font-medium italic bg-slate-50 px-2 py-1 rounded">
                        Finalized
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {!cases.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-16 text-slate-400 italic"
                >
                  No cases found in this section.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}