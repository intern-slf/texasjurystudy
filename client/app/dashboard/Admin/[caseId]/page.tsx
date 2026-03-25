import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CaseFilters } from "@/lib/filter-utils";

/* =========================
   DB ROW TYPES
   ========================= */

interface CaseDocumentRow {
  id: string;
  original_name: string;
  storage_path: string;
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
  presenter_id: string | null;
  user_id: string;
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
      presenter_id,
      user_id,
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
     FETCH PRESENTER PROFILE
     ========================= */

  // Use presenter_id if set, otherwise fall back to user_id (cases are created with only user_id)
  const presenterUserId = caseInfo.presenter_id || caseInfo.user_id;

  let presenterProfile: { id: string; email: string | null; full_name: string | null } | null = null;
  if (presenterUserId) {
    const [{ data: authUser }, { data: profile }, { data: agreement }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(presenterUserId),
      supabaseAdmin.from("profiles").select("id, email, full_name").eq("id", presenterUserId).single(),
      supabaseAdmin.from("confidentiality_agreements_presenter").select("first_name, last_name").eq("user_id", presenterUserId).single(),
    ]);

    const email = authUser?.user?.email || profile?.email || null;
    const full_name = profile?.full_name
      || (agreement ? `${agreement.first_name} ${agreement.last_name}`.trim() : null)
      || authUser?.user?.user_metadata?.full_name
      || null;

    presenterProfile = { id: presenterUserId, email, full_name };
  }

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

        {presenterProfile && (
          <div className="mt-6 bg-slate-50 p-4 rounded border text-sm space-y-1">
            <p className="font-semibold text-slate-700">Presenter</p>
            <p className="text-slate-600">
              {presenterProfile?.full_name || <span className="italic text-slate-400">Name not available</span>}
            </p>
            <p className="text-slate-600">
              {presenterProfile?.email || <span className="italic text-slate-400">Email not available</span>}
            </p>
          </div>
        )}
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
    </div>
  );
}
