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
  drive_link: string | null;
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
      drive_link,
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

        {caseInfo.drive_link && (
          <a
            href={caseInfo.drive_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white p-4 border border-blue-100 rounded-xl shadow-sm hover:bg-blue-50 transition-colors mb-4"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Google Drive Folder</p>
              <p className="text-xs text-blue-600 truncate">{caseInfo.drive_link}</p>
            </div>
          </a>
        )}

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
