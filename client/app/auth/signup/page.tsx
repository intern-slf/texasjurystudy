import { Suspense } from "react";
import { SignUpForm } from "@/components/sign-up-form";
import GoogleLoginClientButton from "@/components/google-login-client-button";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm space-y-6">
        {/* Email / Password Signup */}
        <Suspense
          fallback={
            <div className="h-[400px] animate-pulse bg-muted rounded-xl" />
          }
        >
          <SignUpForm />
        </Suspense>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Google Signup */}
        <GoogleLoginClientButton />
      </div>
    </div>
  );
}
