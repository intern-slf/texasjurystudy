import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const role = user.user_metadata?.role;
  if (role !== "presenter") {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const tab =
    resolvedSearchParams?.tab === "previous"
      ? "previous"
      : "current";

  const { data: cases } = await supabase
    .from("cases")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", tab)
    .order("created_at", { ascending: false });

  return (
    <main className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Presenter</h2>

        <nav className="space-y-2">
          <a
            href="/dashboard/presenter?tab=current"
            className={`block font-medium ${
              tab === "current" ? "underline" : ""
            }`}
          >
            Current
          </a>

          <a href="/dashboard/presenter/new" className="block">
            New
          </a>

          <a
            href="/dashboard/presenter?tab=previous"
            className={`block ${
              tab === "previous" ? "underline" : ""
            }`}
          >
            Previous
          </a>
        </nav>
      </aside>

      {/* Content */}
      <section className="flex-1 px-8 py-10">
        <h1 className="text-2xl font-semibold mb-6">
          {tab === "current"
            ? "Current Focus Groups"
            : "Previous Focus Groups"}
        </h1>

        {!cases?.length && (
          <p className="text-muted-foreground">
            No {tab} focus groups.
          </p>
        )}

        <ul className="space-y-4">
          {cases?.map((c) => (
            <li key={c.id} className="border rounded-md p-4">
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
