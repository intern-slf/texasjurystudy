import { UpdatePasswordForm } from "@/components/update-password-form";
import { AuthShell } from "@/components/auth-shell";
import { KeyRound, ShieldCheck, LogIn } from "lucide-react";

export default function Page() {
  return (
    <AuthShell
      tagline="Almost done"
      title="Set a new"
      accent="password."
      description="Choose something you'll remember — once you save, you'll be signed in automatically."
      features={[
        { icon: KeyRound, text: "Pick a strong, memorable password" },
        { icon: ShieldCheck, text: "Your reset link expires after use for safety" },
        { icon: LogIn, text: "You'll be signed in once you save" },
      ]}
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
