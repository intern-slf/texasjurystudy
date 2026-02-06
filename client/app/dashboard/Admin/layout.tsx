import { redirect } from "next/navigation";
// Relative path from app/dashboard/Admin/ to lib/supabase/server
import { createClient } from "../../../lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  // 1. Authenticate the user session on the server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if no active session exists
  if (!user) {
    redirect("/login");
  }

  // 2. Verify the 'admin' role from the roles table
  const { data: roleData } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  // If the user is authenticated but not an admin, send them to the user dashboard
  if (roleData?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/30">
      {/* Admin Header */}
      <header className="sticky top-0 z-10 border-b bg-white px-8 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-900">Texas Jury Study</h1>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              Administrator Portal
            </span>
          </div>
          
          {/* You can add a logout button or profile dropdown here later */}
          <nav className="flex items-center gap-4">
            <span className="text-sm text-slate-500">
              Logged in as: <span className="font-medium text-slate-700">{user.email}</span>
            </span>
          </nav>
        </div>
      </header>

      {/* Admin Content Area */}
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>

      <footer className="border-t py-4 text-center text-xs text-slate-400">
        &copy; 2026 Texas Jury Study. Confidential Admin Access.
      </footer>
    </div>
  );
}