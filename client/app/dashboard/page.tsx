"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SignaturePad from "@/components/SignaturePad";

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dob: "",
    agreed: false,
  });

  const isFormValid =
    form.agreed &&
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    form.dob !== "" &&
    signature !== "";

  //  Check if user already agreed
  useEffect(() => {
    async function checkAgreement() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("confidentiality_agreements")
        .select("agreed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.agreed) {
        const role = user.user_metadata?.role;

        router.replace(
          role === "presentor" ? "/dashboard/presentor" : "/dashboard/participant"
        );
        return;
      }

      setLoading(false);
    }

    checkAgreement();
  }, []);

  async function submit() {
    if (!isFormValid) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("confidentiality_agreements").insert({
      user_id: user.id,
      agreed: true,
      first_name: form.firstName,
      middle_name: form.middleName || null,
      last_name: form.lastName,
      date_of_birth: form.dob,
      signature_data: signature,
    });

    const role = user.user_metadata?.role;

    router.replace(
      role === "presentor" ? "/presentor" : "/participant"
    );
  }

  // Prevent flicker while checking DB
  if (loading) return null;

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <h1 className="text-3xl font-semibold text-center">
        Confidentiality Agreement
      </h1>

      <p className="text-muted-foreground">
        By signing the acknowledgement below, the participant understands that
        all discussions as part of the jury study will be for private use only.
        In exchange for payment, the participant agrees to keep all information
        confidential and acknowledges that he or she will be disqualified as a
        juror in any of the cases discussed.
      </p>

      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={form.agreed}
          onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
        />
        Yes, I agree.
      </label>

      <div>
        <label className="block text-sm font-medium">Name*</label>

        <input
          placeholder="First"
          className="input mt-2"
          value={form.firstName}
          onChange={(e) =>
            setForm({ ...form, firstName: e.target.value })
          }
        />

        <input
          placeholder="Middle"
          className="input mt-2"
          value={form.middleName}
          onChange={(e) =>
            setForm({ ...form, middleName: e.target.value })
          }
        />

        <input
          placeholder="Last"
          className="input mt-2"
          value={form.lastName}
          onChange={(e) =>
            setForm({ ...form, lastName: e.target.value })
          }
        />
      </div>

      <div>
        <label className="block text-sm font-medium">
          Date of birth*
        </label>

        <input
          type="date"
          className="input mt-2"
          value={form.dob}
          onChange={(e) =>
            setForm({ ...form, dob: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground">
        This is your written agreement to keep confidential everything you see,
        hear or learn concerning any of these cases. This is your agreement not
        to discuss or disclose your participation in this focus group session,
        as well as the identities of the other members of the focus group.
      </p>

      <div>
        <label className="block text-sm font-medium mb-2">
          Signature
        </label>
        <SignaturePad onChange={setSignature} />
      </div>

      <button
        disabled={!isFormValid}
        onClick={submit}
        className="px-6 py-3 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        Submit & Continue
      </button>
    </main>
  );
}
