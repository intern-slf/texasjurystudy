import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminUpdateParticipant } from "@/lib/actions/adminParticipant";
import { autoBlacklistIfIneligible } from "@/lib/actions/autoBlacklist";
import EditProfileForm from "@/components/EditProfileForm";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminEditParticipantPage({
  params,
}: {
  params: Promise<{ participantId: string }>;
}) {
  const { participantId } = await params;

  // Verify the current user is an admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleRow?.role !== "admin") redirect("/dashboard/participant");

  // Fetch the full participant record using admin client
  const { data: participant } = await supabaseAdmin
    .from("jury_participants")
    .select("*")
    .eq("user_id", participantId)
    .single();

  if (!participant) redirect("/dashboard/Admin/participants");

  const backHref = `/dashboard/participant/${participantId}`;

  async function handleUpdate(payload: Record<string, unknown>) {
    "use server";
    await adminUpdateParticipant(participantId, payload);
    const convicted = payload.convicted_felon as string | undefined;
    const citizen = payload.us_citizen as string | undefined;
    if (convicted !== undefined && citizen !== undefined) {
      await autoBlacklistIfIneligible(participantId, convicted, citizen);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link
        href={backHref}
        className="text-blue-600 underline text-sm mb-4 inline-block"
      >
        ← Back to Profile
      </Link>
      <EditProfileForm
        participant={participant}
        adminMode
        onUpdate={handleUpdate}
        backHref={backHref}
      />
    </div>
  );
}
