import CaseFiles from "@/components/CaseFiles";
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

  const role = user.user_metadata?.role;
  if (role !== "presenter") {
    redirect("/dashboard");
  }

  /*  AUTO-MOVE EXPIRED CASES */
  await supabase
    .from("cases")
    .update({ status: "previous" })
    .eq("user_id", user.id)
    .eq("status", "current")
    .lt("scheduled_at", new Date().toISOString());

  const resolvedSearchParams = await searchParams;
  const tab: "current" | "previous" =
    resolvedSearchParams?.tab === "previous"
      ? "previous"
      : "current";

  const { data: cases } = await supabase
    .from("cases")
    .select(`*,case_documents (id)`)
    .eq("user_id", user.id)
    .eq("status", tab)
    .order("created_at", { ascending: false });

  /* ===========================
     SERVER ACTIONS
     =========================== */

  async function softDeleteCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("cases")
      .update({
        status: "previous",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", caseId)
      .eq("user_id", user.id);

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: user.id,
      action: "soft_delete",
    });
    revalidatePath("/dashboard/presenter");
  }

  async function restoreCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("cases")
      .update({
        status: "current",
        deleted_at: null,
      })
      .eq("id", caseId)
      .eq("user_id", user.id);

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: user.id,
      action: "restore",
    });
    revalidatePath("/dashboard/presenter");
  }

  async function permanentDeleteCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("cases")
      .delete()
      .eq("id", caseId)
      .eq("user_id", user.id)
      .eq("status", "previous");

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: user.id,
      action: "permanent_delete",
    });
    revalidatePath("/dashboard/presenter");
  }

  /* ===========================
     UI
     =========================== */

  return (
    <main className="flex min-h-screen">
      <PresenterSidebar activeTab={tab} />

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
            <li
              key={c.id}
              className="border rounded-md p-4"
            >
              <h3 className="font-medium">{c.title}</h3>
              <p className="text-sm text-muted-foreground">
                {c.description}
              </p>

              {c.scheduled_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Scheduled for{" "}
                  {new Date(c.scheduled_at).toLocaleString()}
                </p>
              )}
              {c.case_documents?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {c.case_documents.length} document(s) attached
                </p>
              )}
              {/* 🔽 DROP / UPLOAD SECTION */}
              {tab === "current" && (
                <div className="mt-4">
                  <CaseDocumentUploader caseId={c.id} />
                </div>
              )}
              <h2 className="text-xl font-medium">
                Upload Case Documents
              </h2>

              {c.id ? (
                <CaseDocumentUploader caseId={c.id} />
              ) : (
                <div className="border-2 border-dashed rounded-md p-6 text-center opacity-50">
                  <p className="font-medium">Create the case first</p>
                  <p className="text-sm text-muted-foreground">
                    Documents can be uploaded after saving the case
                  </p>
                </div>
              )}

              <CaseActions
                tab={tab}
                caseId={c.id}
                isExpired={!!c.scheduled_at && new Date(c.scheduled_at).getTime() < Date.now()}
                softDeleteCase={softDeleteCase}
                restoreCase={restoreCase}
                permanentDeleteCase={permanentDeleteCase}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
