"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewCasePage() {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    description: "",
    number_of_attendees: 10,
    documentation_type: "",
    filters: {},
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
    });

    router.replace("/dashboard/presenter");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="text-2xl font-semibold mb-6">
        Create New Case
      </h1>

      <input
        className="input"
        placeholder="Title"
        onChange={(e) =>
          setForm({ ...form, title: e.target.value })
        }
      />

      <textarea
        className="input mt-4"
        placeholder="Description"
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
        defaultValue={10}
        onChange={(e) =>
          setForm({
            ...form,
            number_of_attendees: Number(e.target.value),
          })
        }
      />

      <select
        className="input mt-4"
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

      {/* Filters JSON placeholder */}
      <button
        onClick={submit}
        className="mt-6 px-6 py-3 bg-primary text-primary-foreground rounded"
      >
        Create Case
      </button>
    </main>
  );
}
