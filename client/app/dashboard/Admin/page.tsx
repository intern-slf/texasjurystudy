import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  // CardDescription, CardHeader, CardTitle removed - unused in Table layout
} from "@/components/ui/card";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { sendApprovalEmail } from "@/lib/mail";
import { localToUTC } from "@/lib/timezone";
import { AdminActionButton } from "@/components/AdminActionButton";
import { Button } from "@/components/ui/button";
import TimezoneInput from "@/components/TimezoneInput";
import { Calendar, FileText, Users } from "lucide-react"; // User icon removed - unused

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
  scheduled_at: string | null;
  schedule_status: string | null;
  admin_scheduled_at: string | null;
  deadline_date: string | null; // timestamptz
  is_in_session: boolean;
}

type AdminTab = "requested" | "approved";

/* =========================
   SERVER ACTIONS
   ========================= */

async function proposeSchedule(formData: FormData) {
  "use server";

  const caseId = formData.get("caseId") as string;
  const raw = formData.get("scheduled_at") as string; // "YYYY-MM-DDTHH:MM"
  const tz = formData.get("tz") as string || "UTC";

  const [datePart, timePart] = raw.split("T");
  const adminScheduledAt = localToUTC(datePart, timePart, tz);

  const supabase = await createClient();

  await supabase
    .from("cases")
    .update({
      admin_scheduled_at: adminScheduledAt,
      schedule_status: "pending",
    })
    .eq("id", caseId);

  revalidatePath("/dashboard/Admin");
}

async function unapproveCase(formData: FormData) {
  "use server";

  const caseId = formData.get("caseId") as string;
  const supabase = await createClient();

  await supabase
    .from("cases")
    .update({ admin_status: "all" })
    .eq("id", caseId);

  revalidatePath("/dashboard/Admin");
}

async function approveCase(formData: FormData) {
  "use server";

  const caseId = formData.get("caseId") as string;
  const supabase = await createClient();

  const { data: updatedCase } = await supabase
    .from("cases")
    .update({ admin_status: "approved" })
    .eq("id", caseId)
    .select("title, user_id")
    .single();

  if (updatedCase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", updatedCase.user_id)
      .single();

    if (profile?.email) {
      await sendApprovalEmail(profile.email, updatedCase.title);
    }
  }

  revalidatePath("/dashboard/Admin");
}

/* =========================
   PAGE
   ========================= */

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: AdminTab; test_table?: string }>;
}) {
  const supabase = await createClient();

  const resolvedParams = await searchParams;
  const tab: AdminTab = resolvedParams?.tab ?? "requested";
  const isOldData = resolvedParams?.test_table === "oldData";
  const testTable = isOldData ? "oldData" : "jury_participants";

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
      scheduled_at,
      schedule_status,
      admin_scheduled_at,
      deadline_date,
      case_documents (
        id,
        original_name,
        storage_path
      ),
      session_cases (
        session_id
      )
    `)
    .in(
      "admin_status",
      tab === "requested" ? ["all"] : ["approved", "submitted"]
    )
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
        is_in_session: (c.session_cases ?? []).length > 0,
      };
    })
  );

  // On the approved tab, show unscheduled cases first
  if (tab === "approved") {
    cases.sort((a, b) => {
      if (!a.is_in_session && b.is_in_session) return -1;
      if (a.is_in_session && !b.is_in_session) return 1;
      return 0;
    });
  }

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {tab === "requested" && "Requested Cases"}
            {tab === "approved" && "Approved Cases"}
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage and oversee case submissions and approvals.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-lg border text-xs font-medium">
            <Link
              href={`/dashboard/Admin?tab=${tab}`}
              className={`px-3 py-1.5 rounded-md transition-colors ${!isOldData
                ? "bg-white shadow text-black"
                : "text-slate-500 hover:text-slate-700"
                }`}
            >
              Live Data
            </Link>
            <Link
              href={`/dashboard/Admin?tab=${tab}&test_table=oldData`}
              className={`px-3 py-1.5 rounded-md transition-colors ${isOldData
                ? "bg-white shadow text-black"
                : "text-slate-500 hover:text-slate-700"
                }`}
            >
              Old Data (Testing)
            </Link>
          </div>

          {tab === "approved" && (
            <form
              id="buildSessionForm"
              action="/dashboard/Admin/sessions/new"
              method="GET"
            >
              <input type="hidden" name="test_table" value={isOldData ? "oldData" : "jury_participants"} />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded"
              >
                Build Session
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <Card className="border-muted/60 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-muted/30">
                {/* Checkbox column */}
                {tab === "approved" && <TableHead className="w-10"></TableHead>}

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-6">
                  Case Title
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attendees
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preferred Schedule
                  <br />
                  by Presenter
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Scheduled
                  <br />
                  by Admin
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Deadline
                </TableHead>

                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Documents
                </TableHead>

                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pr-6">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {cases.map((c) => {
                const date = c.scheduled_at ? new Date(c.scheduled_at) : null;
                const adminDate = c.admin_scheduled_at ? new Date(c.admin_scheduled_at) : null;

                return (
                  <TableRow
                    key={c.id}
                    className={`group transition-colors ${
                      c.is_in_session
                        ? "opacity-50 bg-muted/20 hover:bg-muted/20 cursor-not-allowed"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    {/* SELECT */}
                    {tab === "approved" && (
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          name="selectedCases"
                          value={c.id}
                          form="buildSessionForm"
                          disabled={c.is_in_session}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </TableCell>
                    )}

                    {/* TITLE */}
                    <TableCell className="font-medium text-foreground py-4 pl-6">
                      <Link
                        href={`/dashboard/Admin/${c.id}`}
                        className="text-primary hover:text-primary/80 hover:underline flex items-center gap-2"
                      >
                       <FileText className="h-4 w-4 text-muted-foreground" />
                        {c.title}
                      </Link>
                      {c.is_in_session && (
                        <span className="ml-2 inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                          Scheduled
                        </span>
                      )}
                    </TableCell>

                    {/* STATUS */}
                    <TableCell className="py-4">
                      {!c.schedule_status || c.schedule_status === "pending" ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-400/10 px-2 py-1 text-xs font-medium text-yellow-500 ring-1 ring-inset ring-yellow-400/20">
                          Pending
                        </span>
                      ) : c.schedule_status === "accepted" ? (
                        <span className="inline-flex items-center rounded-full bg-green-400/10 px-2 py-1 text-xs font-medium text-green-500 ring-1 ring-inset ring-green-400/20">
                          Accepted
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-400/20">
                          Declined
                        </span>
                      )}
                    </TableCell>

                    {/* ATTENDEES */}
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{c.number_of_attendees}</span>
                      </div>
                    </TableCell>

                    {/* SCHEDULE */}
                    <TableCell className="py-4">
                      {date ? (
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {date.toLocaleDateString()}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Not scheduled
                        </span>
                      )}
                    </TableCell>

                    {/* ADMIN SCHEDULE */}
                    <TableCell className="py-4">
                      {adminDate ? (
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {adminDate.toLocaleDateString()}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {adminDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Not set
                        </span>
                      )}
                    </TableCell>

                    {/* DEADLINE */}
                    <TableCell className="py-4">
                      {c.deadline_date ? (() => {
                        const dl = new Date(c.deadline_date);
                        const isPast = dl < new Date();
                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className={`h-4 w-4 ${isPast ? "text-red-500" : "text-muted-foreground"}`} />
                            <div className="flex flex-col">
                              <span className={`font-medium ${isPast ? "text-red-600" : "text-foreground"}`}>
                                {dl.toLocaleDateString()}
                              </span>
                              <span className={`text-xs ${isPast ? "text-red-400" : "text-muted-foreground"}`}>
                                {dl.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        );
                      })() : (
                        <span className="text-xs text-muted-foreground italic">No deadline</span>
                      )}
                    </TableCell>

                    {/* DOCS */}
                    <TableCell className="py-4 space-y-1">
                      {c.case_documents.length ? (
                        c.case_documents.map((doc) =>
                          doc.signedUrl ? (
                            <a
                              key={doc.id}
                              href={doc.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-primary hover:text-primary/80 hover:underline truncate max-w-[150px]"
                            >
                              📄 {doc.original_name}
                            </a>
                          ) : null
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          No documents
                        </span>
                      )}
                    </TableCell>

                    {/* ACTIONS */}
                    <TableCell className="text-right py-4 pr-6">
                      <div className="flex justify-end flex-wrap gap-2">
                        {tab === "requested" && (
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
                          <>
                            <form action={proposeSchedule} className="flex gap-2 items-center">
                              <input type="hidden" name="caseId" value={c.id} />
                              <TimezoneInput />
                              <input
                                type="datetime-local"
                                name="scheduled_at"
                                required
                                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              />
                              <AdminActionButton
                                label="Send"
                                activeColor="bg-purple-600"
                                hoverColor="hover:bg-purple-700"
                              />
                            </form>

                            <form action={unapproveCase}>
                              <input type="hidden" name="caseId" value={c.id} />
                              <AdminActionButton
                                label="Unapprove"
                                activeColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                              />
                            </form>
                          </>
                        )}

                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!cases.length && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-16 text-muted-foreground italic"
                  >
                    No cases found in this section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}