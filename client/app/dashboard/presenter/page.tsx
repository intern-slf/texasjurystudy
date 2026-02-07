import CaseDocumentUploader from "@/components/CaseDocumentUploader";
import { revalidatePath } from "next/cache";
import CaseActions from "@/components/CaseActions";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PresenterSidebar from "@/components/PresenterSidebar";

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
      AUTO-MOVE EXPIRED CASES
     =========================== */
  const sixtyMinutesAgo = new Date(
    Date.now() - 60 * 60 * 1000
  ).toISOString();

  await supabase
    .from("cases")
    .update({ status: "previous" })
    .eq("user_id", user.id)
    .eq("status", "current")
    .lte("scheduled_at", sixtyMinutesAgo);

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
    caseQuery = caseQuery.eq("admin_status", "approved");
  }

  if (tab === "previous") {
    caseQuery = caseQuery.eq("status", "previous");
  }

  const { data: cases } = await caseQuery;

  /* ===========================
      SERVER ACTIONS
     =========================== */
  async function updateCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const scheduledAt = formData.get("scheduled_at") as string;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
      .eq("user_id", user.id);

    revalidatePath("/dashboard/presenter");
  }

  /* ===========================
      UI
     =========================== */
  return (
    <main className="flex min-h-screen">
      <PresenterSidebar activeTab={tab} />

      <section className="flex-1 px-8 py-10">
        <h1 className="text-2xl font-semibold mb-6 capitalize">
          {tab} Focus Groups
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

              {c.scheduled_at && (
                <p className="text-xs font-semibold text-blue-600 mt-2">
                  📅 Scheduled for: {new Date(c.scheduled_at).toLocaleString("en-GB")}
                </p>
              )}

              {/* APPROVED BADGE */}
              {tab === "approved" && (
                <span className="inline-block mt-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                  Approved by Admin
                </span>
              )}

              {/* UPLOAD + EDIT ONLY FOR CURRENT */}
              {tab === "current" && (
                <>
                  <h2 className="text-lg font-medium mt-4">
                    Upload Case Documents
                  </h2>

                  <CaseDocumentUploader caseId={c.id} />

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm underline">
                      Edit case details
                    </summary>

                    <form action={updateCase} className="mt-3 space-y-3">
                      <input type="hidden" name="case_id" value={c.id} />

                      <input
                        name="title"
                        defaultValue={c.title}
                        className="input w-full"
                        required
                      />

                      <textarea
                        name="description"
                        defaultValue={c.description}
                        className="input w-full"
                      />

                      <input
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
                        className="input"
                      />

                      <button className="px-4 py-2 bg-primary text-white rounded">
                        Save changes
                      </button>
                    </form>
                  </details>
                </>
              )}

              <CaseActions
                tab={tab}
                caseId={c.id}
                isExpired={
                  !!c.scheduled_at &&
                  new Date(c.scheduled_at).getTime() < Date.now()
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}