import { Suspense } from "react"; // 1. Import Suspense
import { SignUpForm } from "@/components/sign-up-form";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {/* 2. Wrap the form in Suspense */}
        <Suspense fallback={<div className="h-[400px] animate-pulse bg-muted rounded-xl" />}>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}