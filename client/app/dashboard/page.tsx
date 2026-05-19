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
import {
  Loader2,
  Sparkles,
  ShieldCheck,
  FileSignature,
  Scale,
  Users,
} from "lucide-react";

type Role = "requestee" | "participant";

function PolishedBackground() {
  return (
    <>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-secondary/10 to-background" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </>
  );
}

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
    (role === "requestee" || form.dob !== "");

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

      if (userRole !== "requestee" && userRole !== "participant") {
        console.error("Invalid role:", userRole);
        setLoading(false);
        return;
      }

      setRole(userRole);

      const table =
        userRole === "requestee"
          ? "confidentiality_agreements_requestee"
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
          userRole === "requestee"
            ? "/dashboard/requestee"
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
      role === "requestee"
        ? await supabase
            .from("confidentiality_agreements_requestee")
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

    if (role === "participant") {
      await supabase
        .from("jury_participants")
        .update({
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          date_of_birth: form.dob || null,
        })
        .eq("user_id", user.id);
    }

    router.replace(
      role === "requestee"
        ? "/dashboard/requestee"
        : "/dashboard/participant"
    );
  }

  if (loading || !role) {
    return (
      <div className="relative overflow-hidden rounded-2xl">
        <PolishedBackground />
        <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4 py-12">
          <Card className="w-full max-w-md border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
            <CardHeader className="text-center space-y-3 pb-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <CardTitle className="text-xl">Loading your dashboard…</CardTitle>
              <CardDescription>
                We&apos;re checking your account — you&apos;ll be redirected shortly.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isRequestee = role === "requestee";
  const RoleIcon = isRequestee ? Scale : Users;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <PolishedBackground />

      <div className="px-4 py-12 md:py-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-4 mb-10">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            Almost there
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
            One last step before <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              your dashboard.
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Texas Jury Study requires a brief confidentiality agreement before you continue. It takes about a minute.
          </p>

          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 backdrop-blur px-4 py-1.5 text-sm font-medium">
            <RoleIcon className="h-4 w-4 text-primary" />
            Signing in as{" "}
            <span className="font-bold text-primary">
              {isRequestee ? "Requestee" : "Participant"}
            </span>
          </div>
        </div>

        {/* Agreement card */}
        <Card className="border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="space-y-2 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl md:text-2xl font-bold">
                  {isRequestee
                    ? "Requestee Confidentiality Agreement"
                    : "Participant Confidentiality Agreement"}
                </CardTitle>
                <CardDescription>
                  Please review and sign below to continue.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-8 pt-6">
            {/* Agreement text */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm md:text-base leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary mb-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                Terms of confidentiality
              </div>
              {isRequestee ? (
                <>
                  By signing this agreement, the requestee acknowledges that all
                  materials, discussions, participant responses, and research outcomes
                  associated with this focus group are strictly confidential. The
                  requestee agrees not to record, distribute, disclose, or reuse any
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

            {/* Checkbox */}
            <label
              htmlFor="agreement"
              className="flex items-start gap-3 rounded-xl border bg-background p-4 shadow-sm transition-colors hover:border-primary/40 cursor-pointer"
            >
              <Checkbox
                id="agreement"
                checked={form.agreed}
                onCheckedChange={(checked) =>
                  setForm({ ...form, agreed: checked as boolean })
                }
                className="mt-0.5"
              />
              <div className="grid gap-1 leading-none">
                <span className="text-sm font-semibold">
                  I agree to the terms and conditions above.
                </span>
                <span className="text-xs text-muted-foreground">
                  Required to continue to your dashboard.
                </span>
              </div>
            </label>

            {/* Personal info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Personal information</h3>
                <span className="text-xs text-muted-foreground">
                  * required
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First name *</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    className="h-11 bg-background/60"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="middleName">Middle name</Label>
                  <Input
                    id="middleName"
                    value={form.middleName}
                    onChange={(e) =>
                      setForm({ ...form, middleName: e.target.value })
                    }
                    className="h-11 bg-background/60"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Last name *</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    className="h-11 bg-background/60"
                  />
                </div>
              </div>

              {!isRequestee && (
                <div className="grid gap-2 sm:max-w-xs">
                  <Label htmlFor="dob">Date of birth *</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={form.dob}
                    onChange={(e) =>
                      setForm({ ...form, dob: e.target.value })
                    }
                    className="h-11 bg-background/60"
                  />
                </div>
              )}
            </div>

            {/* Signature */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-bold">Digital signature *</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                This signature represents your legal obligation to maintain confidentiality regarding all information disclosed during the focus group.
              </p>
              <div className="rounded-xl border bg-white p-1">
                <SignaturePad onChange={setSignature} />
              </div>
            </div>

            {/* Submit */}
            <Button
              disabled={!isFormValid || submitting}
              onClick={submit}
              className="w-full h-12 text-base font-semibold rounded-md shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit & Continue"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              By submitting, you agree to the confidentiality terms above and to be bound by them for any session you join or run.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
