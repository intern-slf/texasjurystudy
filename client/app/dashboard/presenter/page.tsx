import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PresenterDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // 🔒 Role guard
  const role = user.user_metadata?.role;
  if (role !== "presenter") {
    redirect("/dashboard");
  }

  // Fetch current cases
  const { data: cases } = await supabase
    .from("cases")
    .select("*")
    .eq("presenter_id", user.id)
    .eq("status", "current")
    .order("created_at", { ascending: false });

  return (
    <main className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Presenter</h2>

        <nav className="space-y-2">
          <a className="block font-medium">Current</a>
          <a href="/dashboard/presenter/new" className="block">
            New
          </a>
          <a href="/dashboard/presenter/previous" className="block">
            Previous
          </a>
        </nav>
      </aside>

      {/* Content */}
      <section className="flex-1 px-8 py-10">
        <h1 className="text-2xl font-semibold mb-6">
          Current Focus Groups
        </h1>

        {!cases?.length && (
          <p className="text-muted-foreground">
            No active focus groups.
          </p>
        )}

        <ul className="space-y-4">
          {cases?.map((c) => (
            <li
              key={c.id}
              className="border rounded-md p-4"
            >
              <h3 className="font-medium">{c.title}</h3>
              <p className="text-sm text-muted-foreground">
                {c.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
