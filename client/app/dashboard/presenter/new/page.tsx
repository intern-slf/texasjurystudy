"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";

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

  async function submit() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("cases").insert({
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
    });

    router.replace("/dashboard/presenter");
  }

  return (
    <main className="flex min-h-screen">
      {/* Sidebar */}
      <PresenterSidebar />

      {/* Content */}
      <section className="flex-1 max-w-3xl px-8 py-20">
        <h1 className="text-2xl font-semibold mb-6">
          Create New Case
        </h1>

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

        {/* Schedule Date & Time */}
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
          onClick={submit}
          className="mt-6 px-6 py-3 bg-primary text-primary-foreground rounded"
        >
          Create Case
        </button>
      </section>
    </main>
  );
}
