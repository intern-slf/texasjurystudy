"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SignaturePad from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

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
            ? "/dashboard/presenter"
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
      setSubmitting(false);
      return;
    }

    router.replace(
      role === "presenter"
        ? "/dashboard/presenter"
        : "/dashboard/participant"
    );
  }

  // ⏳ Hard stop until role + agreement state is known
  if (loading || !role) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4 md:p-8">
      <Card className="w-full max-w-3xl border-muted shadow-xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl md:text-3xl font-bold">
            {role === "presenter"
              ? "Presenter Confidentiality Agreement"
              : "Participant Confidentiality Agreement"}
          </CardTitle>
          <CardDescription className="text-base md:text-lg">
            Please review and sign the agreement below to continue.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-8">
          <div className="rounded-lg bg-muted/50 p-4 text-sm md:text-base leading-relaxed text-muted-foreground border">
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
          </div>

          <div className="flex items-start space-x-3 rounded-md border p-4 shadow-sm">
            <Checkbox
              id="agreement"
              checked={form.agreed}
              onCheckedChange={(checked) =>
                setForm({ ...form, agreed: checked as boolean })
              }
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="agreement"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                I agree to the terms and conditions above.
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Personal Information</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name*</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="middleName">Middle Name</Label>
                <Input
                  id="middleName"
                  placeholder="Quincy"
                  value={form.middleName}
                  onChange={(e) =>
                    setForm({ ...form, middleName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name*</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            {role === "participant" && (
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="dob">Date of Birth*</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dob}
                  onChange={(e) =>
                    setForm({ ...form, dob: e.target.value })
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Digital Signature</h3>
            <p className="text-sm text-muted-foreground">
              This agreement represents your legal obligation to maintain
              confidentiality regarding all information disclosed during this focus
              group session.
            </p>
            <div className="rounded-md border p-1 bg-white">
              <SignaturePad onChange={setSignature} />
            </div>
          </div>

          <Button
            disabled={!isFormValid || submitting}
            onClick={submit}
            className="w-full text-lg h-12"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit & Continue"
            )}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
