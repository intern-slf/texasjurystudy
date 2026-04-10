import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";
import DriveLinkEditor from "@/components/DriveLinkEditor";
import CaseFilterEditor from "@/components/CaseFilterEditor";
import LocalDateTime from "@/components/LocalDateTime";
import PresenterParticipantHistory from "@/components/PresenterParticipantHistory";
import AddParticipantPresenter from "@/components/AddParticipantPresenter";
import ReceiptPricingPreview from "@/components/ReceiptPricingPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaseFilters } from "@/lib/filter-utils";
import {
  Calendar,
  Clock,
  Users,
  FileText,
  ChevronLeft,
  Upload,
  LinkIcon,
  AlertCircle,
} from "lucide-react";

export default async function PresenterCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const supabase = await createClient();
  const { caseId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  if (user.user_metadata?.role !== "presenter") redirect("/dashboard");

  const { data: c } = await supabase
    .from("cases")
    .select(`
      id, title, description, status, admin_status, schedule_status,
      scheduled_at, admin_scheduled_at, session_completion_timeframe, preferred_day,
      documentation_type, filters, created_at, parent_case_id, hours_requested
    `)
    .eq("id", caseId)
    .eq("user_id", user.id)
    .single();

  // Check if this case has a session (for Add Participant button)
  let hasSession = false;
  if (c) {
    const { data: sessionCaseRow } = await supabase
      .from("session_cases")
      .select("session_id")
      .eq("case_id", caseId)
      .limit(1)
      .maybeSingle();
    hasSession = !!sessionCaseRow?.session_id;
  }


  if (!c) {
    return (
      <div className="flex min-h-screen bg-muted/10">
        <PresenterSidebar activeTab="current" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Case not found.</p>
        </main>
      </div>
    );
  }

  const { status, admin_status, schedule_status } = c;

  const backTab =
    status === "previous"
      ? "previous"
      : admin_status === "all"
      ? "current"
      : "approved";

  const filters = c.filters as CaseFilters | null;

  function StatusBadge() {
    if (status === "previous") return <Badge variant="secondary">Past</Badge>;
    if (admin_status === "all")
      return <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">Awaiting Review</Badge>;
    return <Badge className="bg-green-600 text-white">Approved</Badge>;
  }

  function ScheduleBadge() {
    if (schedule_status === "accepted") return <Badge className="bg-green-600 text-white">Confirmed</Badge>;
    if (schedule_status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    if (schedule_status === "pending") return <Badge variant="outline" className="border-amber-400 text-amber-700">Pending</Badge>;
    return null;
  }


  return (
    <div className="flex min-h-screen bg-muted/10 font-sans">
      <PresenterSidebar activeTab={backTab} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">

          {/* BACK */}
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href={`/dashboard/presenter?tab=${backTab}`}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to {backTab === "current" ? "Requested" : backTab === "approved" ? "Approved" : "Past"} Cases
            </Link>
          </Button>

          {/* TITLE + STATUS */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <StatusBadge />
              <ScheduleBadge />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Created <LocalDateTime iso={c.created_at} mode="date" />
            </p>
          </div>

          {/* META CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="bg-white border rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Doc Type
              </p>
              <p className="text-sm font-semibold">{c.documentation_type ?? "—"}</p>
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Preferred Date
              </p>
              <p className="text-sm font-semibold">
                {c.scheduled_at ? <LocalDateTime iso={c.scheduled_at} mode="date" /> : "—"}
              </p>
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Completion Timeframe
              </p>
              <p className="text-sm font-semibold">
                {c.session_completion_timeframe || "—"}
              </p>
            </div>
          </div>

          {/* ADMIN SCHEDULED DATE */}
          {c.admin_scheduled_at && (
            <div className="bg-white border rounded-xl p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Admin-Scheduled Session</p>
                <p className="text-xs text-muted-foreground">
                  <LocalDateTime iso={c.admin_scheduled_at} />
                </p>
              </div>
              <ScheduleBadge />
            </div>
          )}

          {/* DESCRIPTION */}
          <section className="bg-white border rounded-xl p-6 space-y-2">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Description
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.description}</p>
          </section>

          {/* DOCUMENTS */}
          <section className="bg-white border rounded-xl p-6 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" /> Case Documents
            </h2>
            <CaseDocumentUploader caseId={c.id} />
          </section>

          {/* DRIVE LINKS */}
          <section className="bg-white border rounded-xl p-6 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground" /> Drive Links
            </h2>
            <DriveLinkEditor caseId={c.id} />
          </section>

          {/* CASE LINEAGE & PARTICIPANTS */}
          <section className="bg-white border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" /> Case Lineage & Participants
              </h2>
              <AddParticipantPresenter caseId={c.id} hasSession={hasSession} />
            </div>
            {!hasSession && (
              <p className="text-xs text-muted-foreground">
                A session must be scheduled by the admin before you can add participants.
              </p>
            )}
            <PresenterParticipantHistory caseId={c.id} currentCaseId={c.id} />
          </section>

          {/* PARTICIPANT FILTERS */}
          <section className="bg-white border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" /> Participant Filters
              </h2>
              {!c.admin_scheduled_at && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  Editable until a session is scheduled
                </span>
              )}
            </div>
            <CaseFilterEditor
              caseId={c.id}
              initialFilters={filters}
              locked={!!c.admin_scheduled_at}
            />
          </section>

          {/* TRANSCRIPT PRICING PREVIEW (non-previous cases) */}
          {status !== "previous" && (
            <section className="space-y-2">
              <ReceiptPricingPreview filters={filters} hoursRequested={c.hours_requested} />
            </section>
          )}


        </div>
      </main>
    </div>
  );
}
