import { createClient } from "@/lib/supabase/server";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";
import { getPendingInvites } from "@/lib/participant/getPendingInvites";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";

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
     FETCH INVITES
     ========================= */
  const pendingInvites = await getPendingInvites(participant.user_id);

  /* =========================
     DASHBOARD VIEW
     ========================= */
  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      {/* HEADER */}
      <div className="bg-white border rounded-xl p-6">
        <h1 className="text-2xl font-bold">
          Welcome {participant.first_name}
        </h1>
        <p className="text-slate-500">
          {participant.city}, {participant.state}
        </p>
      </div>

      {/* SESSION INVITES */}
      {pendingInvites.length > 0 && (
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Session Invitations</h2>

          <div className="space-y-4">
            {pendingInvites.map((invite) => (
              <form
                key={invite.id}
                className="flex items-center justify-between border p-4 rounded-lg"
              >
                <div>
                  <p className="font-medium">Session Invite</p>
                  <p className="text-sm text-slate-500">
                    Date: {invite.sessions?.[0]?.session_date}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    formAction={async () => {
                      "use server";
                      await updateInviteStatus(invite.id, "accepted");
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Accept
                  </button>

                  <button
                    formAction={async () => {
                      "use server";
                      await updateInviteStatus(invite.id, "declined");
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                  >
                    Decline
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      )}

      {/* VIEW PROFILE */}
      <Link
        href={`/dashboard/participant/${participant.id}`}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg"
      >
        View Full Profile
      </Link>
    </div>
  );
}