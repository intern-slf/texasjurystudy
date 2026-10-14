import { createClient } from "@/lib/supabase/server";

/**
 * For server actions only a law firm (requestee) may call. Like requireAdmin, it
 * reads the caller's own public.roles row, not user_metadata.role, which anyone
 * can change on their own login. Every login has a roles row since
 * 20261003_roles_row_for_every_login.sql.
 *
 * Returns the firm's user id.
 */
export async function requireRequestee(): Promise<string> {
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
  if (roleRow?.role !== "requestee") throw new Error("Not authorized");

  return user.id;
}
