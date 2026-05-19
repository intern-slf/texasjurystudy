import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/auth-shell";
import { LayoutDashboard, FolderKanban, UserCog } from "lucide-react";

export default function Page() {
  return (
    <AuthShell
      tagline="Welcome back"
      title="Pick up right where"
      accent="you left off."
      description="Sign in to access your dashboard, manage your cases or sessions, and stay on top of what's next."
      features={[
        { icon: LayoutDashboard, text: "Jump straight into your dashboard" },
        { icon: FolderKanban, text: "Review your cases and upcoming sessions" },
        { icon: UserCog, text: "Update your details anytime" },
      ]}
    >
      <LoginForm />
    </AuthShell>
  );
}
