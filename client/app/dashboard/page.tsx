"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardRouter from "./router";
import SignaturePad from "@/components/SignaturePad";

export default function DashboardPage() {
  const supabase = createClient();

  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dob: "",
    agreed: false,
  });

  async function submit() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("confidentiality_agreements").insert({
      user_id: user.id,
      agreed: form.agreed,
      first_name: form.firstName,
      middle_name: form.middleName || null,
      last_name: form.lastName,
      date_of_birth: form.dob,
      signature_data: signature,
    });

    setSubmitted(true);
  }

  if (submitted) {
    return <DashboardRouter />;
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <h1 className="text-3xl font-semibold text-center">
        Confidentiality Agreement
      </h1>

      <p className="text-muted-foreground">
        By signing below, you agree to keep all information confidential and
        understand that violation may result in disqualification.
      </p>

      <input
        placeholder="First name"
        className="input"
        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
      />

      <input
        placeholder="Middle name (optional)"
        className="input"
        onChange={(e) => setForm({ ...form, middleName: e.target.value })}
      />

      <input
        placeholder="Last name"
        className="input"
        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
      />

      <input
        type="date"
        className="input"
        onChange={(e) => setForm({ ...form, dob: e.target.value })}
      />

      <SignaturePad onChange={setSignature} />

      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
        />
        I agree to the confidentiality terms
      </label>

      <button
        disabled={!form.agreed || !signature}
        onClick={submit}
        className="px-6 py-3 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        Submit & Continue
      </button>
    </main>
  );
}
