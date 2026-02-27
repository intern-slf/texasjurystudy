import CaseDocumentUploader from "@/components/CaseDocumentUploader";
import { revalidatePath } from "next/cache";
import CaseActions from "@/components/CaseActions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PresenterSidebar from "@/components/PresenterSidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, AlertCircle, FileText, Upload, ArrowRight } from "lucide-react";
import { getAncestorCaseIds } from "@/lib/case-lineage";
import PreviousParticipantsModal from "@/components/PreviousParticipantsModal";
import ReschedulePopup, { type RescheduleItem } from "@/components/ReschedulePopup";
import LocalDateTime from "@/components/LocalDateTime";

// Define a proper interface for your case object to replace 'any'
interface Case {
  id: string;
  title: string;
  description: string;
  scheduled_at: string | null;
  admin_scheduled_at: string | null;
  schedule_status: string | null;
  parent_case_id: string | null;
  [key: string]: unknown; // Allow for dynamic fields from Supabase
}

type PresenterDashboardProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

export default async function PresenterDashboard({
  searchParams,
}: PresenterDashboardProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  if (user.user_metadata?.role !== "presenter") redirect("/dashboard");

  /* ===========================
    AUTO-MOVE EXPIRED SCHEDULED CASES
  =========================== */

  const nowIso = new Date().toISOString();

  // Move any current case whose admin-scheduled datetime has passed to "previous"
  const { data: expiredCases, error: expiredError } = await supabase
    .from("cases")
    .update({
      status: "previous",
    })
    .eq("user_id", user.id)
    .eq("status", "current")
    .not("admin_scheduled_at", "is", null)
    .lte("admin_scheduled_at", nowIso)
    .select("id");

  if (expiredError) {
    console.error("Error moving expired cases:", expiredError.message);
  }

  if (expiredCases?.length) {
    console.log("Moved expired cases to previous:", expiredCases);
  }
  
  /* ===========================
      TAB HANDLING
      =========================== */
  const resolvedSearchParams = await searchParams;

  const tab: "current" | "approved" | "previous" =
    resolvedSearchParams?.tab === "approved"
      ? "approved"
      : resolvedSearchParams?.tab === "previous"
      ? "previous"
      : "current";

  /* ===========================
      FETCH CASES (UPDATED QUERY)
      =========================== */
  let caseQuery = supabase
    .from("cases")
    .select(`*, case_documents (id)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (tab === "current") {
    caseQuery = caseQuery
      .eq("status", "current")
      .eq("admin_status", "all");
  }

  if (tab === "approved") {
    caseQuery = caseQuery
      .eq("admin_status", "approved")
      .eq("status", "current");
  }

  if (tab === "previous") {
    caseQuery = caseQuery.eq("status", "previous");
  }

  const { data: cases } = await caseQuery;

  // Always fetch cases pending schedule confirmation (regardless of current tab)
  const { data: pendingConfirmCases } = await supabase
    .from("cases")
    .select("id, title, admin_scheduled_at")
    .eq("user_id", user.id)
    .eq("admin_status", "approved")
    .eq("status", "current")
    .not("admin_scheduled_at", "is", null)
    .or("schedule_status.is.null,schedule_status.eq.pending");

  // Pre-fetch ancestor IDs for previous and approved cases to avoid await in map
  const ancestorMap: Record<string, string[]> = {};
  if ((tab === "previous" || tab === "approved") && cases) {
    for (const c of cases) {
      ancestorMap[c.id] = await getAncestorCaseIds(c.id);
    }
  }

  /* ===========================
      SERVER ACTIONS
      =========================== */

  async function softDeleteCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;

    await supabase
      .from("cases")
      .update({
        status: "previous",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", caseId)
      .eq("user_id", activeUser.id);

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: activeUser.id,
      action: "soft_delete",
    });

    revalidatePath("/dashboard/presenter");
  }

  async function restoreCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;

    await supabase
      .from("cases")
      .update({
        status: "current",
        deleted_at: null,
      })
      .eq("id", caseId)
      .eq("user_id", activeUser.id);

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: activeUser.id,
      action: "restore",
    });

    revalidatePath("/dashboard/presenter");
  }

  async function permanentDeleteCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;

    await supabase
      .from("cases")
      .delete()
      .eq("id", caseId)
      .eq("user_id", activeUser.id)
      .eq("status", "previous");

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: activeUser.id,
      action: "permanent_delete",
    });

    revalidatePath("/dashboard/presenter");
  }

  async function updateCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const scheduledAt = formData.get("scheduled_at") as string;

    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;

    await supabase
      .from("cases")
      .update({
        title,
        description,
        scheduled_at: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null,
      })
      .eq("id", caseId)
      .eq("user_id", activeUser.id);

    revalidatePath("/dashboard/presenter");
  }

  async function respondToSchedule(formData: FormData) {
    "use server";

    const caseId = formData.get("caseId") as string;
    const response = formData.get("response") as "accepted" | "rejected";

    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();

    if (!activeUser) return;

    const updatePayload: Record<string, string | null> = { schedule_status: response };
    if (response === "accepted") {
      const { data: caseData } = await supabase
        .from("cases")
        .select("admin_scheduled_at")
        .eq("id", caseId)
        .single();
      updatePayload.scheduled_at = caseData?.admin_scheduled_at ?? null;
    }

    await supabase
      .from("cases")
      .update(updatePayload)
      .eq("id", caseId)
      .eq("user_id", activeUser.id);

    revalidatePath("/dashboard/presenter");
  }

  /* ===========================
      UI
      =========================== */

  // Build reschedule popup items from all approved cases awaiting confirmation (any tab)
  const presenterRescheduleItems: RescheduleItem[] = (pendingConfirmCases ?? []).map((c) => ({
    id: c.id,
    actionId: c.id,
    title: c.title,
    newDate: c.admin_scheduled_at!,
    displayDate: new Date(c.admin_scheduled_at!).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  }));

  async function acceptScheduleFromPopup(caseId: string) {
    "use server";
    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;
    const { data: caseData } = await supabase
      .from("cases")
      .select("admin_scheduled_at")
      .eq("id", caseId)
      .single();
    await supabase
      .from("cases")
      .update({
        schedule_status: "accepted",
        scheduled_at: caseData?.admin_scheduled_at ?? null,
      })
      .eq("id", caseId)
      .eq("user_id", activeUser.id);
    revalidatePath("/dashboard/presenter");
  }

  async function declineScheduleFromPopup(caseId: string) {
    "use server";
    const supabase = await createClient();
    const { data: { user: activeUser } } = await supabase.auth.getUser();
    if (!activeUser) return;
    await supabase
      .from("cases")
      .update({ schedule_status: "rejected" })
      .eq("id", caseId)
      .eq("user_id", activeUser.id);
    revalidatePath("/dashboard/presenter");
  }

  return (
    <div className="flex min-h-screen bg-muted/10 font-sans">
      {presenterRescheduleItems.length > 0 && (
        <ReschedulePopup
          items={presenterRescheduleItems}
          role="presenter"
          onAccept={acceptScheduleFromPopup}
          onDecline={declineScheduleFromPopup}
        />
      )}

      <PresenterSidebar activeTab={tab} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight capitalize">
                {tab === "current" ? "Request Cases" : tab} Focus Groups
              </h1>
              <p className="text-muted-foreground mt-2">
                {tab === "current"
                  ? "Cases you've submitted are awaiting admin review. You'll be notified once approved."
                  : tab === "approved"
                  ? "Your cases have been approved. Once the admin assigns a session date, you'll need to confirm your availability."
                  : "Cases from completed sessions. You can restore a case or request a follow-up."}
              </p>
            </div>
            
            {tab === "current" && (
                <div className="hidden md:block">
                     <Badge variant="outline" className="text-sm py-1 px-3 bg-white">
                        {cases?.length || 0} Active Cases
                     </Badge>
                </div>
            )}
          </div>

          {!cases?.length && (
            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-card/50">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              <h3 className="text-lg font-semibold">No cases here yet</h3>
              <p className="text-muted-foreground mt-1">
                {tab === "current"
                  ? "Submit a new case using the sidebar to get started."
                  : tab === "approved"
                  ? "Cases approved by the admin will appear here, waiting for a session date."
                  : "Completed sessions will appear here once a case has been presented."}
              </p>
            </div>
          )}

          <div className="grid gap-6">
            {(cases as Case[] | null)?.map((c) => (
              <Card key={c.id} className="overflow-hidden border-muted shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-muted/10 pb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-xl">{c.title}</CardTitle>
                            <CardDescription className="line-clamp-2 mt-1">
                                {c.description}
                            </CardDescription>
                        </div>
                         {(c.admin_scheduled_at || c.scheduled_at) && (
                            <Badge variant="secondary" className="flex items-center gap-1.5 font-medium">
                                <Calendar className="h-3 w-3" />
                                <LocalDateTime iso={(c.admin_scheduled_at || c.scheduled_at) as string} mode="date" />
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                
                <CardContent className="pt-6">
                  {/* APPROVED AREA */}
                  {tab === "approved" && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-700 rounded-lg border border-green-500/20">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">Admin approved this case — a session will be scheduled for you.</span>
                        </div>

                      {/* Reschedule / pending-confirmation notice */}
                      {(c.schedule_status === null || c.schedule_status === "pending") &&
                        c.admin_scheduled_at && (
                          <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span className="text-sm font-medium">
                              The admin has scheduled a session for this case. Please accept or reject the date below.
                            </span>
                          </div>
                        )}

                      {/* Admin scheduled date */}
                      {c.admin_scheduled_at && (
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                    <Calendar className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Scheduled Session Date</p>
                                    <p className="text-xs text-muted-foreground">
                                        <LocalDateTime iso={c.admin_scheduled_at} />
                                    </p>
                                </div>
                            </div>
                            <Badge variant={c.schedule_status === "accepted" ? "default" : c.schedule_status === "rejected" ? "destructive" : "outline"} className="capitalize">
                                {c.schedule_status === "accepted"
                                  ? "Confirmed"
                                  : c.schedule_status === "rejected"
                                  ? "Rejected"
                                  : "Awaiting Your Response"}
                            </Badge>
                        </div>
                      )}

                      {(c.schedule_status === null ||
                        c.schedule_status === "pending") &&
                        c.admin_scheduled_at && (
                          <div className="flex gap-3 pt-2">
                            <form action={respondToSchedule}>
                              <input type="hidden" name="caseId" value={c.id} />
                              <input type="hidden" name="response" value="accepted" />
                              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                                Confirm Attendance
                              </Button>
                            </form>

                            <form action={respondToSchedule}>
                              <input type="hidden" name="caseId" value={c.id} />
                              <input type="hidden" name="response" value="rejected" />
                              <Button size="sm" variant="destructive">
                                Decline
                              </Button>
                            </form>
                          </div>
                        )}

                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                        <PreviousParticipantsModal
                          caseId={c.id}
                          ancestorIds={ancestorMap[c.id] || []}
                        />
                      </div>
                    </div>
                  )}

                  {/* CURRENT */}
                  {tab === "current" && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Case Documents
                        </h4>
                        <div className="bg-muted/30 rounded-lg p-4 border border-dashed">
                            <CaseDocumentUploader caseId={c.id} />
                        </div>
                      </div>

                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline flex items-center gap-2 select-none">
                            <span>Edit Case Details</span>
                        </summary>

                        <div className="pt-4 animate-in slide-in-from-top-2 duration-300">
                             <form action={updateCase} className="space-y-4 border p-4 rounded-lg bg-card">
                                <input type="hidden" name="case_id" value={c.id} />

                                <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</label>
                                    <Input
                                        name="title"
                                        defaultValue={c.title}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</label>
                                    <Textarea
                                        name="description"
                                        defaultValue={c.description}
                                        className="min-h-[100px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedule</label>
                                    <Input
                                        type="datetime-local"
                                        name="scheduled_at"
                                        defaultValue={
                                        c.scheduled_at
                                            ? new Date(
                                                new Date(c.scheduled_at).getTime() -
                                                new Date().getTimezoneOffset() * 60000
                                            )
                                                .toISOString()
                                                .slice(0, 16)
                                            : ""
                                        }
                                    />
                                </div>

                                <div className="pt-2">
                                    <Button size="sm">Save Changes</Button>
                                </div>
                            </form>
                        </div>
                      </details>
                    </div>
                  )}

                  {/* PREVIOUS */}
                  {tab === "previous" && (
                    <div className="flex flex-col gap-4 pt-2">
                      <div className="flex items-center gap-3">
                      {/* Restore only if not expired */}
                      {(!c.scheduled_at ||
                        new Date(c.scheduled_at).getTime() > Date.now()) && (
                        <form action={restoreCase}>
                          <input type="hidden" name="case_id" value={c.id} />
                          <Button size="sm" variant="outline" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            Restore Case
                          </Button>
                        </form>
                      )}

                      <form action={permanentDeleteCase}>
                        <input type="hidden" name="case_id" value={c.id} />
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                            Permanently Delete
                        </Button>
                      </form>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                        <PreviousParticipantsModal
                          caseId={c.id}
                          ancestorIds={ancestorMap[c.id] || []}
                        />

                        <Button
                          asChild
                          size="sm"
                          variant="default"
                          className="bg-primary hover:bg-primary/90 flex items-center gap-2"
                        >
                          <Link href={`/dashboard/presenter/new?parent_id=${c.id}`}>
                            Request Follow-up
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-6 pt-6 border-t flex justify-between items-center">
                       <CaseActions
                        tab={tab}
                        caseId={c.id}
                        isExpired={
                        !!c.scheduled_at &&
                        new Date(c.scheduled_at).getTime() < Date.now()
                        }
                    />
                    
                     {tab === "current" && (
                        <form action={softDeleteCase}>
                            <input type="hidden" name="case_id" value={c.id} />
                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                                Move to Archive
                            </Button>
                        </form>
                     )}
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}