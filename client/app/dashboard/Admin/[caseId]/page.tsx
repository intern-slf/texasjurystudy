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

interface DriveLinkRow {
  id: string;
  url: string;
}

interface CaseInfo {
  id: string;
  title: string;
  status: string;
  description: string;
  drive_link: string | null;
  filters: CaseFilters;
  admin_scheduled_at: string | null;
  presenter_id: string | null;
  user_id: string;
  case_documents: CaseDocument[];
  case_drive_links: DriveLinkRow[];
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
      admin_scheduled_at,
      presenter_id,
      user_id,
      case_documents (
        id,
        original_name,
        storage_path
      ),
      case_drive_links (
        id,
        url
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
    case_drive_links: (rawCase.case_drive_links ?? []) as DriveLinkRow[],
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

        {/* New multi-link drive links */}
        {caseInfo.case_drive_links.length > 0 && (
          <div className="flex flex-col gap-3 mb-4">
            {caseInfo.case_drive_links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white p-4 border border-blue-100 rounded-xl shadow-sm hover:bg-blue-50 transition-colors"
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
                  <p className="text-xs text-blue-600 truncate">{link.url}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Legacy single drive_link fallback (shown only if no new links exist) */}
        {caseInfo.drive_link && caseInfo.case_drive_links.length === 0 && (
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

      {/* PARTICIPANT FILTERS */}
      <section className="bg-white p-8 rounded-xl border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Participant Filters</h3>
          {caseInfo.admin_scheduled_at ? (
            <span className="text-xs bg-slate-100 border border-slate-300 text-slate-600 px-2 py-0.5 rounded-full">
              🔒 Locked — session scheduled
            </span>
          ) : (
            <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
              Editable by presenter
            </span>
          )}
        </div>

        {(() => {
          const f = caseInfo.filters as CaseFilters | null;
          if (!f) {
            return <p className="text-sm text-slate-400 italic">No filters set by presenter.</p>;
          }

          const rows: { label: string; value: string }[] = [];

          if (f.gender?.length) rows.push({ label: "Gender", value: f.gender.join(", ") });
          if (f.race?.length) rows.push({ label: "Race", value: f.race.join(", ") });
          if (f.age?.min !== undefined || f.age?.max !== undefined) {
            const min = f.age?.min ?? 18;
            const max = f.age?.max ?? 99;
            const isDefault = min === 18 && max === 99;
            if (!isDefault) rows.push({ label: "Age", value: `${min} – ${max}` });
          }
          if (f.location?.state?.length) rows.push({ label: "Location", value: f.location.state.join(", ") });
          if (f.political_affiliation?.length) rows.push({ label: "Political Affiliation", value: f.political_affiliation.join(", ") });

          const elig = f.eligibility;
          if (elig) {
            if (elig.served_on_jury && elig.served_on_jury !== "Any") rows.push({ label: "Served on Jury", value: elig.served_on_jury });
            if (elig.has_children && elig.has_children !== "Any") rows.push({ label: "Has Children", value: elig.has_children });
            if (elig.served_armed_forces && elig.served_armed_forces !== "Any") rows.push({ label: "Served Armed Forces", value: elig.served_armed_forces });
            if (elig.currently_employed && elig.currently_employed !== "Any") rows.push({ label: "Currently Employed", value: elig.currently_employed });
          }

          const socio = f.socioeconomic;
          if (socio) {
            if (socio.marital_status?.length) rows.push({ label: "Marital Status", value: socio.marital_status.join(", ") });
            if (socio.education_level?.length) rows.push({ label: "Education Level", value: socio.education_level.join(", ") });
            if (socio.family_income?.length) rows.push({ label: "Family Income", value: socio.family_income.join(", ") });
            if (socio.availability?.length) rows.push({ label: "Availability", value: socio.availability.join(", ") });
          }

          if (rows.length === 0) {
            return <p className="text-sm text-slate-400 italic">No specific filters applied (all participants eligible).</p>;
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rows.map(({ label, value }) => (
                <div key={label} className="bg-slate-50 border rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
