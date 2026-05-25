import { createClient } from "@/lib/supabase/server";
import EditProfileForm from "@/components/EditProfileForm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ reactivated?: string }>;
}) {
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

  const resolved = (await searchParams) ?? {};
  const reactivated = resolved.reactivated === "1";

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link
        href="/dashboard/participant"
        className="text-blue-600 underline text-sm mb-4 inline-block"
      >
        ← Back to Dashboard
      </Link>
      {reactivated && (
        <div className="mb-6 rounded-lg border-2 border-green-300 bg-green-50 px-5 py-4">
          <p className="text-base font-semibold text-green-900">
            Welcome back — please complete your response
          </p>
          <p className="mt-1 text-sm text-green-800">
            To finish reactivating your profile, please upload a valid Texas ID
            and confirm your PayPal account below. Your response isn&rsquo;t
            complete until both are saved.
          </p>
        </div>
      )}
      <EditProfileForm participant={participant} />
    </div>
  );
}
