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

/* ===========================
   AUTO-MOVE EXPIRED CASES
   (scheduled_at + 60 minutes)
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

  async function updateCase(formData: FormData) {
    "use server";

    const caseId = formData.get("case_id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const scheduledAt = formData.get("scheduled_at") as string;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
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

    await supabase.from("case_audit_logs").insert({
      case_id: caseId,
      user_id: user.id,
      action: "update_case",
    });

    revalidatePath("/dashboard/presenter");
  }


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
              <details className="mt-4">
                <summary className="cursor-pointer text-sm underline">
                  Edit case details
                </summary>

                <form action={updateCase} className="mt-3 space-y-3">
                  <input type="hidden" name="case_id" value={c.id} />

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Title</label>
                    <input
                      name="title"
                      defaultValue={c.title}
                      className="input w-full"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      name="description"
                      defaultValue={c.description}
                      className="input w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Scheduled at</label>
                    <input
                      type="datetime-local"
                      name="scheduled_at"
                      defaultValue={
                        c.scheduled_at
                          ? new Date(
                              new Date(c.scheduled_at).getTime()
                              - new Date().getTimezoneOffset() * 60000
                            ).toISOString().slice(0, 16)
                          : ""
                      }
                      className="input"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium"
                  >
                    Save changes
                  </button>
                </form>
              </details>

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
