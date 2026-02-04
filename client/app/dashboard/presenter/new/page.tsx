"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";

export default function NewCasePage() {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
    number_of_attendees: 10,
    documentation_type: "",
    filters: {},
    scheduled_at: "",
  });

  const [caseId, setCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createCaseAndUpload() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("cases")
      .insert({
        user_id: user.id,
        title: form.title,
        description: form.description,
        number_of_attendees: form.number_of_attendees,
        documentation_type: form.documentation_type,
        filters: form.filters,
        status: "current",
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setCaseId(data.id); // 🔑 unlock uploader
    setLoading(false);
  }

  function finishAndGoToDashboard() {
    router.replace("/dashboard/presenter");
  }

  return (
    <main className="flex min-h-screen">
      <PresenterSidebar />

      <section className="flex-1 max-w-3xl px-8 py-20">
        <h1 className="text-2xl font-semibold mb-6">
          New Case
        </h1>

        {!caseId && (
          <>
            <input
              className="input"
              placeholder="Title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />

            <textarea
              className="input mt-4"
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />

            <input
              type="number"
              className="input mt-4"
              value={form.number_of_attendees}
              min={1}
              onChange={(e) =>
                setForm({
                  ...form,
                  number_of_attendees: Number(e.target.value),
                })
              }
            />

            <select
              className="input mt-4"
              value={form.documentation_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  documentation_type: e.target.value,
                })
              }
            >
              <option value="">Select documentation</option>
              <option value="nda">NDA</option>
              <option value="consent">Consent</option>
            </select>

            <input
              type="datetime-local"
              className="input mt-4"
              value={form.scheduled_at}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheduled_at: e.target.value,
                })
              }
            />

            <button
              onClick={createCaseAndUpload}
              disabled={loading}
              className="mt-6 px-6 py-3 bg-primary text-primary-foreground rounded"
            >
              {loading ? "Preparing..." : "Upload documents"}
            </button>
          </>
        )}

        {caseId && (
          <>
            <h2 className="text-xl font-medium mt-10 mb-4">
              Upload Case Documents
            </h2>

            <CaseDocumentUploader caseId={caseId} />

            <button
              onClick={finishAndGoToDashboard}
              className="mt-8 px-4 py-2 text-sm underline"
            >
              Finish & go to dashboard
            </button>
          </>
        )}
      </section>
    </main>
  );
}
