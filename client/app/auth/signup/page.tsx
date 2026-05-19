import { Suspense } from "react";
import { SignUpForm } from "@/components/sign-up-form";
import { AuthShell } from "@/components/auth-shell";
import { ShieldCheck, Users, Zap } from "lucide-react";

export default function Page() {
  return (
    <AuthShell
      tagline="Join Texas Jury Study"
      title="Create your"
      accent="free account."
      description="It takes a couple of minutes. Pick the role that fits and we'll guide you the rest of the way."
      features={[
        { icon: Zap, text: "Free to create — no commitment, no payment up front" },
        { icon: Users, text: "Choose your role: participant or requestee" },
        { icon: ShieldCheck, text: "Your details stay private and secure" },
      ]}
    >
      <Suspense
        fallback={<div className="h-[420px] animate-pulse bg-muted rounded-2xl" />}
      >
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
