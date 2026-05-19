import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return params?.error ? (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive text-left">
      <span className="font-semibold">Error code:</span> {params.error}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground text-center">
      An unspecified error occurred. Please try again — if it keeps happening, get in touch with support.
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <AuthShell
      variant="centered"
      tagline="Something went wrong"
      title="We hit a"
      accent="snag."
      description="Don't worry — your account and data are safe. Try one of the options below to keep moving."
    >
      <Card className="border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">Sorry, something went wrong</CardTitle>
          <CardDescription>
            We weren&apos;t able to complete that request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <Suspense
            fallback={
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            }
          >
            <ErrorContent searchParams={searchParams} />
          </Suspense>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link
              href="/auth/login"
              className="inline-flex flex-1 h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold shadow-sm transition-all hover:bg-accent hover:-translate-y-0.5"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Link>
            <Link
              href="/"
              className="inline-flex flex-1 h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow transition-all hover:bg-primary/90 hover:-translate-y-0.5"
            >
              <Home className="mr-2 h-4 w-4" />
              Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
