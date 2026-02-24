import { redirect } from "next/navigation";
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
  // Fetch only admin_status to minimize payload
  const { data: allCases } = await supabase
    .from("cases")
    .select("admin_status");

  // Count total sessions (from real schema)
  const { count: sessionsCount } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true });

  // Count approved participants (not blacklisted)
  const { count: approvedParticipantsCount } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true })
    .eq("approved_by_admin", true)
    .is("blacklisted_at", null);

  // Count new participants (not approved and not blacklisted)
  const { count: newParticipantsCount } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true })
    .eq("approved_by_admin", false)
    .is("blacklisted_at", null);

  // Count blacklisted participants
  const { count: blacklistedParticipantsCount } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true })
    .not("blacklisted_at", "is", null);

  // Sidebar badge counts
  const counts = {
    requested: allCases?.filter((c) => c.admin_status === "all").length || 0,
    approved:
      allCases?.filter((c) => c.admin_status === "approved").length || 0,
    submitted:
      allCases?.filter((c) => c.admin_status === "submitted").length || 0,
    sessions: sessionsCount || 0,
    approvedParticipants: approvedParticipantsCount || 0,
    newParticipants: newParticipantsCount || 0,
    blacklistedParticipants: blacklistedParticipantsCount || 0,
  };

  return (
    <div className="flex min-h-screen bg-muted/10 font-sans">
      {/* SIDEBAR */}
      <AdminSidebar active="requested" counts={counts} />

      {/* MAIN AREA */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* HEADER */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
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

            <nav className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                  Current User
                </span>
                <span className="text-sm font-semibold">
                  {user.email}
                </span>
              </div>
              <div className="h-9 w-9 rounded-full bg-primary/10 border flex items-center justify-center text-xs font-bold text-primary shadow-sm">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            </nav>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-muted/10">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>

        {/* FOOTER */}
        <footer className="border-t bg-background px-8 py-4 flex justify-between items-center text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span>&copy; 2026 Texas Jury Study</span>
            <span className="h-3 w-[1px] bg-border" />
            <span>v1.0.4</span>
          </div>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-primary" />
            Confidential Admin Access
            <span className="h-1 w-1 rounded-full bg-primary" />
          </span>
        </footer>
      </div>
    </div>
  );
}
