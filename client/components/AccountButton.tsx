"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleUserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearLastVisited, readLastVisited } from "@/lib/last-visited";
import { cn } from "@/lib/utils";

/**
 * Takes the place of "Sign Up" once signed in, and sends the user back to the
 * last app page they were on. The session is re-checked first so an expired
 * token lands on the login form rather than a page that bounces them anyway.
 */
export default function AccountButton({ className }: { className?: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const goToAccount = async () => {
    if (checking) return;
    setChecking(true);

    // getUser() revalidates against Supabase (refreshing the token when it
    // still can); getSession() would happily hand back an expired local one.
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      clearLastVisited();
      router.push("/auth/login");
      // The navbar's signed-in state is server-rendered, so the RSC payload
      // has to be re-fetched or the stale account icon survives the nav.
      router.refresh();
    } else {
      // No remembered page yet (fresh login, or they have only seen the
      // marketing pages) — /dashboard routes them by role.
      router.push(readLastVisited() ?? "/dashboard");
    }

    setChecking(false);
  };

  return (
    <button
      type="button"
      onClick={goToAccount}
      disabled={checking}
      aria-label="Account"
      aria-busy={checking}
      title="Account"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-input bg-background text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      <CircleUserRound className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
