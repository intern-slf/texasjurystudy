import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MailCheck, ArrowRight } from "lucide-react";

export default function Page() {
  return (
    <AuthShell
      variant="centered"
      tagline="Account created"
      title="Check your"
      accent="email."
      description="We just sent you a confirmation link. Click it from your inbox to verify your account."
    >
      <Card className="border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MailCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">Confirmation link sent</CardTitle>
          <CardDescription>
            You&apos;ve successfully signed up. Please check your email to confirm your account before signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Didn&apos;t get it? Check your spam folder or try signing up again with the same email.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex w-full h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition-all hover:bg-primary/90 hover:-translate-y-0.5"
          >
            Go to Login
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
