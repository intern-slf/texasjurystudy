"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardRouter() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      const { data: role } = await supabase
        .from("roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (role?.role === "participant") {
        router.replace("/dashboard/participant");
      } else if (role?.role === "presenter") {
        router.replace("/dashboard/presenter");
      } else {
        router.replace("/");
      }
    });
  }, [router]);

  return null;
}
