import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "../../../lib/supabase/server";
import AdminSidebar from "@/components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  /* =========================
      AUTH CHECK
     ========================= */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /* =========================
      ROLE CHECK
     ========================= */
  const { data: roleData } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleData?.role !== "admin") {
    redirect("/dashboard");
  }

  /* =========================
      FETCH COUNTS FOR SIDEBAR
     ========================= */
  // Include linked session dates so we can filter approved cases the same way
  // the Approved Cases page does (hide cases whose sessions have all passed).
  // These queries don't depend on one another, so run them concurrently
  // instead of one-after-another (this layout runs on every admin navigation).
  const [
    { data: allCases },
    { count: sessionsCount },
    { count: approvedParticipantsCount },
    { count: newParticipantsCount },
    { count: blacklistedParticipantsCount },
  ] = await Promise.all([
    // Only the statuses the badge counts below care about — avoids transferring
    // the entire cases table (rejected/other rows) just to count two badges.
    supabase
      .from("cases")
      .select("admin_status, session_cases(sessions(session_date))")
      .in("admin_status", ["all", "approved", "submitted"]),

    // Count total sessions (from real schema)
    supabase
      .from("sessions")
      .select("*", { count: "exact", head: true }),

    // Count approved participants (not blacklisted)
    supabase
      .from("jury_participants")
      .select("*", { count: "exact", head: true })
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null),

    // Count new participants (not approved and not blacklisted)
    supabase
      .from("jury_participants")
      .select("*", { count: "exact", head: true })
      .eq("approved_by_admin", false)
      .is("blacklisted_at", null),

    // Count blacklisted participants
    supabase
      .from("jury_participants")
      .select("*", { count: "exact", head: true })
      .not("blacklisted_at", "is", null),
  ]);

  // Match the Approved Cases page filter: include "approved" + "submitted",
  // and hide cases whose linked sessions are all in the past.
  const todayStr = new Date().toISOString().slice(0, 10);
  type SessionCaseRow = { sessions?: { session_date?: string | null } | { session_date?: string | null }[] | null };
  type CaseRow = { admin_status?: string | null; session_cases?: SessionCaseRow[] | null };
  const approvedCount = ((allCases ?? []) as CaseRow[]).filter((c) => {
    if (!c.admin_status || !["approved", "submitted"].includes(c.admin_status)) return false;
    const sessionCases = c.session_cases ?? [];
    if (sessionCases.length === 0) return true;
    return sessionCases.some((sc) => {
      const session = Array.isArray(sc.sessions) ? sc.sessions[0] : sc.sessions;
      return (session?.session_date ?? "") >= todayStr;
    });
  }).length;

  // Sidebar badge counts
  const counts = {
    requested: allCases?.filter((c) => c.admin_status === "all").length || 0,
    approved: approvedCount,
    sessions: sessionsCount || 0,
    approvedParticipants: approvedParticipantsCount || 0,
    newParticipants: newParticipantsCount || 0,
    blacklistedParticipants: blacklistedParticipantsCount || 0,
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/10 font-sans lg:flex-row">
      {/* SIDEBAR */}
      <AdminSidebar active="requested" counts={counts} />

      {/* MAIN AREA */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* HEADER */}
        {/* Only sticky from lg up — below that the global navbar is already
            pinned at top:0 and the two would overlap. */}
        <header className="relative z-20 border-b bg-background/80 backdrop-blur-md px-4 py-4 shadow-sm sm:px-6 lg:sticky lg:top-0 lg:px-8">
          {/* Wraps rather than truncating, so a long email stays readable on a phone. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="text-xl font-bold tracking-tight">
                Texas Jury Study
              </h1>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  Administrator Portal
                </span>
              </div>
            </div>

            <nav className="flex shrink-0 items-center gap-3 sm:gap-6">
              <div className="flex min-w-0 flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  Current User
                </span>
                <span className="text-sm font-semibold">
                  {user.email}
                </span>
              </div>
              <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 border flex items-center justify-center text-xs font-bold text-primary shadow-sm">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            </nav>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-muted/10 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>

        {/* FOOTER */}
        <footer className="border-t bg-background px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; {new Date().getFullYear()} Texas Jury Study. All rights
              reserved.
            </p>
            <p className="inline-flex items-center gap-2 font-medium">
              <ShieldCheck
                className="h-3.5 w-3.5 text-primary"
                aria-hidden="true"
              />
              Confidential — authorized administrators only
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
