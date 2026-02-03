"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SignaturePad from "@/components/SignaturePad";

type Role = "presenter" | "participant";

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState("");
  const [role, setRole] = useState<Role | null>(null);

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
    signature !== "" &&
    (role === "presenter" || form.dob !== "");

  // 🔒 Check agreement + role on mount
  useEffect(() => {
    let mounted = true;

    async function checkAgreement() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !mounted) {
        setLoading(false);
        return;
      }

      const userRole = user.user_metadata?.role;

      // ✅ HARD ROLE GUARD
      if (userRole !== "presenter" && userRole !== "participant") {
        console.error("Invalid role:", userRole);
        setLoading(false);
        return;
      }

      setRole(userRole);

      const table =
        userRole === "presenter"
          ? "confidentiality_agreements_presenter"
          : "confidentiality_agreements";

      const { data, error } = await supabase
        .from(table)
        .select("agreed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Agreement check failed:", error);
        setLoading(false);
        return;
      }

      if (data?.agreed) {
        router.replace(
          userRole === "presenter"
            ? "/dashboard/presenter/onboarding"
            : "/dashboard/participant"
        );
        return;
      }

      setLoading(false);
    }

    checkAgreement();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function submit() {
    if (!isFormValid || submitting || !role) return;

    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      return;
    }

    const insertResult =
  role === "presenter"
    ? await supabase
        .from("confidentiality_agreements_presenter")
        .upsert(
          {
            user_id: user.id,
            agreed: true,
            agreed_at: new Date().toISOString(),
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            signature_data: signature,
          },
          { onConflict: "user_id" }
        )
    : await supabase
        .from("confidentiality_agreements")
        .upsert(
          {
            user_id: user.id,
            agreed: true,
            first_name: form.firstName.trim(),
            middle_name: form.middleName.trim() || null,
            last_name: form.lastName.trim(),
            date_of_birth: form.dob,
            signature_data: signature,
          },
          { onConflict: "user_id" }
        );


    if (insertResult.error) {
        console.error("Agreement insert failed");
        console.error("message:", insertResult.error.message);
        console.error("code:", insertResult.error.code);
        console.error("details:", insertResult.error.details);
        console.error("hint:", insertResult.error.hint);
        setSubmitting(false);
        return;
    }


    router.replace(
      role === "presenter"
        ? "/dashboard/presenter/onboarding"
        : "/dashboard/participant"
    );
  }

  // ⏳ Hard stop until role + agreement state is known
  if (loading || !role) return null;

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-6">
      <h1 className="text-3xl font-semibold text-center">
        {role === "presenter"
          ? "Presenter Confidentiality Agreement"
          : "Participant Confidentiality Agreement"}
      </h1>

      <p className="text-muted-foreground">
        {role === "presenter" ? (
          <>
            By signing this agreement, the presenter acknowledges that all
            materials, discussions, participant responses, and research outcomes
            associated with this focus group are strictly confidential. The
            presenter agrees not to record, distribute, disclose, or reuse any
            information obtained during the session outside the scope of this
            study.
          </>
        ) : (
          <>
            By signing the acknowledgement below, the participant understands
            that all discussions as part of the jury study will be for private
            use only. In exchange for payment, the participant agrees to keep all
            information confidential and acknowledges that he or she will be
            disqualified as a juror in any of the cases discussed.
          </>
        )}
      </p>

      <label className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={form.agreed}
          onChange={(e) =>
            setForm({ ...form, agreed: e.target.checked })
          }
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

      {role === "participant" && (
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
      )}

      <p className="text-muted-foreground">
        This agreement represents your legal obligation to maintain
        confidentiality regarding all information disclosed during this focus
        group session.
      </p>

      <div>
        <label className="block text-sm font-medium mb-2">
          Signature
        </label>
        <SignaturePad onChange={setSignature} />
      </div>

      <button
        disabled={!isFormValid || submitting}
        onClick={submit}
        className="px-6 py-3 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit & Continue"}
      </button>
    </main>
  );
}
