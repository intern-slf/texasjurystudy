import { createClient } from "@/lib/supabase/server";

/**
 * For server actions only admins may call. A "use server" export is a public endpoint:
 * anyone signed in can call it with any arguments (middleware.ts only checks for a
 * login), so every admin action has to check the caller itself. Throws, like the inline
 * checks in lib/actions/session.ts, so the admin screens show the error.
 *
 * Returns the admin's user id.
 */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") throw new Error("Not authorized");

  return user.id;
}
