import { createClient } from "@/lib/supabase/server";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";
import { getPendingInvites } from "@/lib/participant/getPendingInvites";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { unstable_noStore as noStore } from "next/cache";

export default async function ParticipantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ inviteId?: string; status?: string }>;
}) {
  noStore();
  const { inviteId, status } = await searchParams;
  const supabase = await createClient();

  /* =========================
     HANDLE EMAIL ACTIONS (If present)
     ========================= */
  if (inviteId && (status === "accepted" || status === "declined")) {
    console.log(`[ParticipantDashboard] Handling URL invite response: ID=${inviteId}, status=${status}`);
    try {
      await updateInviteStatus(inviteId, status as "accepted" | "declined");
      console.log(`[ParticipantDashboard] Update success, preparing to redirect...`);
    } catch (err: any) {
      console.error(`[ParticipantDashboard] Failed to handle URL invite response:`, err.message);
    }
    // Redirect must be OUTSIDE try/catch because trigger an internal Next.js error
    redirect("/dashboard/participant?success=true");
  }


  /* =========================
     AUTH
     ========================= */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6 bg-white border border-green-100 rounded-2xl p-10 shadow-sm">
          <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Response Recorded!</h2>
            <p className="text-slate-600">Your choice has been saved. Please log in to your dashboard to see your full schedule and next steps.</p>
          </div>
          <Link href="/auth/login" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all hover:bg-blue-700">
            Log In to Your Dashboard
          </Link>
        </div>
      </div>
    );
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
                    Date: {(() => {
                      const session = Array.isArray(invite.sessions) ? invite.sessions[0] : invite.sessions;
                      return session?.session_date;
                    })()}
                  </p>
                  <p className="text-sm text-slate-500">
                    Time: {(() => {
                      const session = Array.isArray(invite.sessions) ? invite.sessions[0] : invite.sessions;
                      const cases = session?.session_cases || [];
                      if (cases.length === 0) return "TBD";

                      const startTimes = cases.map((c: any) => c.start_time).filter(Boolean).sort();
                      const endTimes = cases.map((c: any) => c.end_time).filter(Boolean).sort();

                      if (startTimes.length === 0 || endTimes.length === 0) return "TBD";

                      return `${startTimes[0]} - ${endTimes[endTimes.length - 1]}`;
                    })()}
                  </p>
                  <p className="text-sm text-slate-500">
                    Cases: {(() => {
                      const session = Array.isArray(invite.sessions) ? invite.sessions[0] : invite.sessions;
                      const cases = session?.session_cases || [];
                      if (cases.length === 0) return "None";

                      return cases.map((c: any) => {
                        const caseDetail = Array.isArray(c.cases) ? c.cases[0] : c.cases;
                        return caseDetail?.title;
                      }).filter(Boolean).join(", ");
                    })()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    formAction={async () => {
                      "use server";
                      await updateInviteStatus(invite.id, "accepted");
                      revalidatePath("/dashboard/participant");
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Accept
                  </button>

                  <button
                    formAction={async () => {
                      "use server";
                      await updateInviteStatus(invite.id, "declined");
                      revalidatePath("/dashboard/participant");
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

      {/* VIEW / EDIT PROFILE */}
      <div className="flex gap-3">
        <Link
          href={`/dashboard/participant/${participant.id}`}
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          View Full Profile
        </Link>
        <Link
          href="/dashboard/participant/edit"
          className="inline-block bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Edit Profile
        </Link>
      </div>
    </div>
  );
}