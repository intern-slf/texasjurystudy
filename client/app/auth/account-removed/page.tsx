import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck, Home } from "lucide-react";
import { UNDERAGE_MESSAGE } from "@/lib/age-gate";

// Where deleteAccountIfUnderage sends someone once their account is gone.
export default function Page() {
  return (
    <AuthShell
      variant="centered"
      tagline="Account removed"
      title="Adults"
      accent="only."
      description={UNDERAGE_MESSAGE}
    >
      <Card className="border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">Your account has been deleted</CardTitle>
          <CardDescription>
            The date of birth you entered shows you are under 18, so we have permanently
            deleted your account and the information you gave us.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Link
            href="/"
            className="inline-flex w-full h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition-all hover:bg-primary/90 hover:-translate-y-0.5"
          >
            <Home className="mr-2 h-4 w-4" />
            Back to home
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
