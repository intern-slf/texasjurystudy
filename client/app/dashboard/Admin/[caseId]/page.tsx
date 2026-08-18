import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CaseFilters } from "@/lib/filter-utils";
import ReceiptPricingPreview from "@/components/ReceiptPricingPreview";
import CaseLineagePanel from "@/components/CaseLineagePanel";
import CaseSessionsPanel from "@/components/CaseSessionsPanel";
import BackButton from "@/components/BackButton";

const fmtDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

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
  requestee_id: string | null;
  user_id: string;
  admin_status: string | null;
  schedule_status: string | null;
  created_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  deadline_date: string | null;
  rejection_reason: string | null;
  parent_case_id: string | null;
  case_type: string | null;
  focus_group_type: string | null;
  documentation_type: string | null;
  county: string | null;
  participants_from_county: string | null;
  session_completion_timeframe: string | null;
  preferred_day: string | null;
  number_of_attendees: number | null;
  hours_requested: number | null;
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
      hours_requested,
      admin_scheduled_at,
      requestee_id,
      user_id,
      admin_status,
      schedule_status,
      created_at,
      approved_at,
      scheduled_at,
      deadline_date,
      rejection_reason,
      parent_case_id,
      case_type,
      focus_group_type,
      documentation_type,
      county,
      participants_from_county,
      session_completion_timeframe,
      preferred_day,
      number_of_attendees,
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
     FETCH REQUESTEE PROFILE
     ========================= */

  // Use requestee_id if set, otherwise fall back to user_id (cases are created with only user_id)
  const requesteeUserId = caseInfo.requestee_id || caseInfo.user_id;

  let requesteeProfile: { id: string; email: string | null; full_name: string | null } | null = null;
  if (requesteeUserId) {
    const [{ data: authUser }, { data: agreement }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(requesteeUserId),
      supabaseAdmin.from("confidentiality_agreements_requestee").select("first_name, last_name").eq("user_id", requesteeUserId).single(),
    ]);

    const email = authUser?.user?.email || null;
    const full_name = (agreement ? `${agreement.first_name} ${agreement.last_name}`.trim() : null)
      || authUser?.user?.user_metadata?.full_name
      || null;

    requesteeProfile = { id: requesteeUserId, email, full_name };
  }

  /* =========================
     UI
     ========================= */

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 py-6 sm:space-y-10 sm:p-6">
      <BackButton href="/dashboard/Admin" label="Back to Cases" />

      {/* CASE INFO */}
      <section className="bg-white p-5 rounded-xl border shadow-sm sm:p-8">
        <h1 className="text-3xl font-extrabold">{caseInfo.title}</h1>

        {/* STATUS BADGES */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-400/20 capitalize">
            {caseInfo.status}
          </span>
          {caseInfo.admin_status && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset capitalize ${
                caseInfo.admin_status === "rejected"
                  ? "bg-red-400/10 text-red-600 ring-red-400/20"
                  : caseInfo.admin_status === "approved" || caseInfo.admin_status === "submitted"
                    ? "bg-green-400/10 text-green-600 ring-green-400/20"
                    : "bg-amber-400/10 text-amber-700 ring-amber-400/30"
              }`}
            >
              Admin: {caseInfo.admin_status}
            </span>
          )}
          {caseInfo.schedule_status && (
            <span className="inline-flex items-center rounded-full bg-slate-400/10 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-400/20 capitalize">
              Schedule: {caseInfo.schedule_status}
            </span>
          )}
          {caseInfo.parent_case_id && (
            <Link
              href={`/dashboard/Admin/${caseInfo.parent_case_id}`}
              className="inline-flex items-center rounded-full bg-purple-400/10 px-2.5 py-1 text-xs font-medium text-purple-600 ring-1 ring-inset ring-purple-400/20 hover:bg-purple-400/20"
            >
              Follow-up case — view parent →
            </Link>
          )}
        </div>

        {/* REJECTION REASON */}
        {caseInfo.admin_status === "rejected" && caseInfo.rejection_reason && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">Rejection reason</p>
            <p className="text-sm text-red-600 mt-0.5">{caseInfo.rejection_reason}</p>
          </div>
        )}

        <p className="mt-6 bg-slate-50 p-4 rounded border italic">
          {caseInfo.description}
        </p>

        {/* KEY DETAILS */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {[
            { label: "Case Type", value: caseInfo.case_type },
            { label: "Focus Group", value: caseInfo.focus_group_type },
            { label: "Documentation", value: caseInfo.documentation_type },
            { label: "County", value: caseInfo.county },
            {
              label: "Participants from County",
              value: caseInfo.participants_from_county,
            },
            {
              label: "Attendees Requested",
              value: caseInfo.number_of_attendees?.toString(),
            },
            { label: "Hours Requested", value: caseInfo.hours_requested?.toString() },
            { label: "Preferred Day", value: caseInfo.preferred_day },
            {
              label: "Completion Timeframe",
              value: caseInfo.session_completion_timeframe,
            },
            { label: "Deadline", value: caseInfo.deadline_date ? fmtDate(caseInfo.deadline_date) : null },
            { label: "Created", value: fmtDate(caseInfo.created_at) },
            { label: "Approved", value: caseInfo.approved_at ? fmtDate(caseInfo.approved_at) : null },
            {
              label: "Scheduled",
              value: caseInfo.admin_scheduled_at || caseInfo.scheduled_at
                ? fmtDate(caseInfo.admin_scheduled_at || caseInfo.scheduled_at)
                : null,
            },
          ]
            .filter((row) => row.value)
            .map(({ label, value }) => (
              <div key={label} className="bg-slate-50 border rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                  {label}
                </p>
                <p className="text-sm text-slate-800">{value}</p>
              </div>
            ))}
        </div>

        {requesteeProfile && (
          <div className="mt-6 bg-slate-50 p-4 rounded border text-sm space-y-1">
            <p className="font-semibold text-slate-700">Requestee</p>
            <p className="text-slate-600">
              {requesteeProfile?.full_name || <span className="italic text-slate-400">Name not available</span>}
            </p>
            <p className="text-slate-600">
              {requesteeProfile?.email || <span className="italic text-slate-400">Email not available</span>}
            </p>
          </div>
        )}
      </section>

      {/* SESSIONS & PARTICIPANTS */}
      <CaseSessionsPanel caseId={caseInfo.id} />

      {/* CASE HISTORY / FOLLOW-UP CHAIN */}
      <CaseLineagePanel caseId={caseInfo.id} />

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

      {/* RECEIPT */}
      <section>
        <h3 className="text-xl font-bold mb-4">Receipt</h3>
        <ReceiptPricingPreview
          filters={caseInfo.filters}
          hoursRequested={caseInfo.hours_requested}
        />
      </section>

      {/* PARTICIPANT FILTERS */}
      <section className="bg-white p-5 rounded-xl border shadow-sm sm:p-8">
        <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-bold">Participant Filters</h3>
          {caseInfo.admin_scheduled_at ? (
            <span className="text-xs bg-slate-100 border border-slate-300 text-slate-600 px-2 py-0.5 rounded-full">
              🔒 Locked — session scheduled
            </span>
          ) : (
            <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
              Editable by requestee
            </span>
          )}
        </div>

        {(() => {
          const f = caseInfo.filters as CaseFilters | null;
          if (!f) {
            return <p className="text-sm text-slate-400 italic">No filters set by requestee.</p>;
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
