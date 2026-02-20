import { createClient } from "@/lib/supabase/server";
import EditProfileForm from "@/components/EditProfileForm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

export default async function EditProfilePage() {
  noStore();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: participant } = await supabase
    .from("jury_participants")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!participant) redirect("/dashboard/participant");

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link
        href="/dashboard/participant"
        className="text-blue-600 underline text-sm mb-4 inline-block"
      >
        ← Back to Dashboard
      </Link>
      <EditProfileForm participant={participant} />
    </div>
  );
}
