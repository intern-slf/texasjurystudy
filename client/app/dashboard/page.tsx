import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardRouter() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("uuid", user.id)
    .single();

  if (!roleRow) redirect("/");

  if (roleRow.role === "participant") {
    redirect("/participant");
  }

  if (roleRow.role === "presenter") {
    redirect("/presenter/onboarding");
  }

  redirect("/");
}
