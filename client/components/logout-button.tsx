"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { clearLastVisited } from "@/lib/last-visited";

export function LogoutButton({
  className,
  variant,
  size,
}: {
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // The next person on this browser must not inherit the page this user was
    // on via the account icon.
    clearLastVisited();
    router.push("/auth/login");
    // The navbar's signed-in state is server-rendered, so the RSC payload has
    // to be re-fetched or the stale "Logout" would survive the navigation.
    router.refresh();
  };

  return (
    <Button onClick={logout} variant={variant} size={size} className={className}>
      Logout
    </Button>
  );
}
