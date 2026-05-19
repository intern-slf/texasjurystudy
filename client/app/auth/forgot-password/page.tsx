import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AuthShell } from "@/components/auth-shell";
import { Mail, KeyRound, ShieldCheck } from "lucide-react";

export default function Page() {
  return (
    <AuthShell
      tagline="Account recovery"
      title="Forgot your"
      accent="password?"
      description="It happens. Enter the email you signed up with and we'll send you a secure link to set a new one."
      features={[
        { icon: Mail, text: "We'll email you a one-time reset link" },
        { icon: KeyRound, text: "Set a new password in under a minute" },
        { icon: ShieldCheck, text: "Your account stays secure throughout" },
      ]}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
