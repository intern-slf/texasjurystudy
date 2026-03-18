import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";
import { getPendingInvites } from "@/lib/participant/getPendingInvites";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { unstable_noStore as noStore } from "next/cache";
import ReschedulePopup, { type RescheduleItem } from "@/components/ReschedulePopup";

export default async function ParticipantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ inviteId?: string; status?: string }>;
}) {
  noStore();
  const { inviteId, status } = await searchParams;
  const supabase = await createClient();

  /* =========================
     AUTH
     ========================= */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* =========================
     HANDLE EMAIL ACTIONS (If present)
     ========================= */
  if (inviteId && (status === "accepted" || status === "declined")) {
    if (!user) {
      // Not logged in — save intent in query param and send to login
      redirect(`/auth/login?next=/dashboard/participant?inviteId=${inviteId}&status=${status}`);
    }
    console.log(`[ParticipantDashboard] Handling URL invite response: ID=${inviteId}, status=${status}`);
    try {
      await updateInviteStatus(inviteId, status as "accepted" | "declined");
      console.log(`[ParticipantDashboard] Update success, preparing to redirect...`);
    } catch (err: any) {
      console.error(`[ParticipantDashboard] Failed to handle URL invite response:`, err.message);
    }
    // Redirect must be OUTSIDE try/catch because it triggers an internal Next.js error
    redirect("/dashboard/participant");
  }

  if (!user) {
    redirect("/auth/login");
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
        <ParticipantForm userId={user.id} email={user.email!} />
      </div>
    );
  }

  /* =========================
     FETCH INVITES
     ========================= */
  const pendingInvites = await getPendingInvites(participant.user_id);

  /* =========================
     FETCH ACCEPTED SESSIONS (for reschedule popup)
     ========================= */
  const { data: acceptedInvites } = await supabaseAdmin
    .from("session_participants")
    .select("id, session_id, sessions(session_date, session_cases(start_time, end_time, cases(title)))")
    .eq("participant_id", participant.user_id)
    .eq("invite_status", "accepted");

  const fmtUtc = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  };

  const rescheduleItems: RescheduleItem[] = (acceptedInvites ?? []).flatMap((inv) => {
    const session = Array.isArray(inv.sessions) ? inv.sessions[0] : inv.sessions;
    const date: string = (session as any)?.session_date ?? "";
    if (!date) return [];

    const sessionCases: any[] = (session as any)?.session_cases ?? [];
    const starts = sessionCases.map((c: any) => c.start_time).filter(Boolean).sort();
    const ends   = sessionCases.map((c: any) => c.end_time).filter(Boolean).sort();
    const timeRange = starts.length && ends.length
      ? `${fmtUtc(starts[0])} – ${fmtUtc(ends[ends.length - 1])} (UTC)`
      : undefined;

    return [{
      id: inv.session_id,
      actionId: inv.id,
      title: `Session on ${date}`,
      newDate: date,
      displayDate: new Date(date).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      }),
      timeRange,
    }];
  });

  async function acceptReschedule(inviteId: string) {
    "use server";
    await updateInviteStatus(inviteId, "accepted");
    revalidatePath("/dashboard/participant");
  }

  async function declineReschedule(inviteId: string) {
    "use server";
    await updateInviteStatus(inviteId, "declined");
    revalidatePath("/dashboard/participant");
  }

  /* =========================
     DASHBOARD VIEW
     ========================= */
  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      {/* RESCHEDULE POPUP */}
      {rescheduleItems.length > 0 && (
        <ReschedulePopup
          items={rescheduleItems}
          role="participant"
          onAccept={acceptReschedule}
          onDecline={declineReschedule}
        />
      )}

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

                      const fmtUtc = (t: string) => {
                        const [h, m] = t.split(":");
                        const d = new Date();
                        d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
                        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
                      };

                      return `${fmtUtc(startTimes[0])} – ${fmtUtc(endTimes[endTimes.length - 1])} (UTC)`;
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

      {/* NO ACTIVE SESSIONS — ONBOARDING DIRECTIONS */}
      {pendingInvites.length === 0 && (
        <section className="bg-white border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">
            Welcome to the Texas Jury Study!
          </h2>
          <p className="text-slate-600">
            You currently don&apos;t have any active sessions. Here is what you can expect next:
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-xl">📩</span>
              <div>
                <span className="font-semibold text-slate-800">Watch Your Inbox:</span>{" "}
                <span className="text-slate-600">We will notify you via email as soon as a study opens up that matches your profile.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-xl">🗓️</span>
              <div>
                <span className="font-semibold text-slate-800">Check Your Availability:</span>{" "}
                <span className="text-slate-600">Review the session&apos;s date, time, and details to see if it fits your schedule.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-xl">✅</span>
              <div>
                <span className="font-semibold text-slate-800">Claim Your Spot:</span>{" "}
                <span className="text-slate-600">If you are available, just accept the email invitation to become a participant.</span>
              </div>
            </li>
          </ul>
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <span className="font-semibold">Tip:</span> Keeping your Full Profile updated helps us send you the most relevant studies!
          </p>
        </section>
      )}

      {/* VIEW / EDIT PROFILE + MY SESSIONS */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/dashboard/participant/sessions"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          My Sessions
        </Link>
        <Link
          href={`/dashboard/participant/${participant.id}`}
          className="inline-block bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
        >
          View Full Profile
        </Link>
        <Link
          href="/dashboard/participant/edit"
          className="inline-block bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Edit Profile
        </Link>
      </div>
    </div>
  );
}