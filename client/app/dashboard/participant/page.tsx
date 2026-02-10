import { createClient } from "@/lib/supabase/server";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";

export default async function ParticipantDashboard() {
  const supabase = await createClient();

  /* =========================
     AUTH
     ========================= */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <p className="p-8">Not authenticated</p>;
  }

  /* =========================
     GET PARTICIPANT ROW
     ========================= */
  const { data: participant } = await supabase
    .from("jury_participants")
    .select("*")
    .eq("user_id", user.id)
    .single();

  /* =========================
     IF NOT EXISTS → SHOW FORM
     ========================= */
  if (!participant) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <ParticipantForm userId={user.id} />
      </div>
    );
  }

  /* =========================
     DASHBOARD VIEW
     ========================= */
  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <div className="bg-white border rounded-xl p-6">
        <h1 className="text-2xl font-bold">
          Welcome {participant.first_name}
        </h1>
        <p className="text-slate-500">
          {participant.city}, {participant.state}
        </p>
      </div>

      <Link
        href={`/dashboard/participant/${participant.id}`}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg"
      >
        View Full Profile
      </Link>
    </div>
  );
}
