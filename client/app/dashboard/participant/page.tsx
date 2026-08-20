import { createClient } from "@/lib/supabase/server";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";
import { getPendingInvites } from "@/lib/participant/getPendingInvites";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";
import { hasSessionStarted } from "@/lib/participant/sessionStart";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  WAITLISTED_STATUS,
  HOURLY_RATE_CENTS,
  WAITLIST_WAIT_FEE_CENTS,
  WAITLIST_HOLD_MINUTES,
  formatCents,
  sessionLengthHours,
  seatPayoutCents,
} from "@/lib/participant/waitlist";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { unstable_noStore as noStore } from "next/cache";

/** Shape of the nested session on a pending invite (see getPendingInvites). */
type InviteSession = {
  session_date?: string | null;
  session_cases?: { start_time?: string | null; end_time?: string | null }[] | null;
};

export default async function ParticipantDashboard({
  searchParams,
}: {
  searchParams: Promise<{ inviteId?: string; status?: string; sessionFull?: string; missingProfile?: string; inactive?: string; sessionStarted?: string; waitlisted?: string; waitlistOffer?: string; waitlistDeclined?: string }>;
}) {
  noStore();
  const { inviteId, status, sessionFull, missingProfile, inactive, sessionStarted, waitlisted, waitlistOffer, waitlistDeclined } = await searchParams;
  /** Invite id currently being offered a waitlist slot, if any. */
  const offerFor = waitlistOffer ?? null;
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
    let redirectTo = "/dashboard/participant";
    try {
      const result = await updateInviteStatus(inviteId, status as "accepted" | "declined");
      if (result && "blocked" in result && result.blocked) {
        if (result.reason === "missing_profile") {
          const missing = (result as { missing?: string[] }).missing ?? [];
          redirectTo = `/dashboard/participant?missingProfile=${missing.join(",")}`;
        } else if (result.reason === "inactive") {
          redirectTo = "/dashboard/participant?inactive=1";
        } else if (result.reason === "session_started") {
          redirectTo = "/dashboard/participant?sessionStarted=1";
        } else {
          redirectTo = "/dashboard/participant?sessionFull=1";
        }
      } else {
        console.log(`[ParticipantDashboard] Update success, preparing to redirect...`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ParticipantDashboard] Failed to handle URL invite response:`, msg);
    }
    redirect(redirectTo);
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
      <div className="max-w-3xl mx-auto px-4 py-6 sm:p-8">
        <ParticipantForm userId={user.id} email={user.email!} />
      </div>
    );
  }

  /* =========================
     FETCH INVITES
     ========================= */
  const pendingInvites = await getPendingInvites(participant.user_id);

  // Waitlisted invites are not "pending" — the person already answered — so they
  // would otherwise fall through to the "no active sessions" onboarding block
  // despite holding a slot and a Zoom link.
  const { data: waitlistRows } = await supabaseAdmin
    .from("session_participants")
    .select("id, sessions(session_date)")
    .eq("participant_id", participant.user_id)
    .eq("invite_status", WAITLISTED_STATUS);

  const todayStr = new Date().toISOString().slice(0, 10);
  const waitlistedSessions = (waitlistRows ?? [])
    .map((row) => {
      const session = (Array.isArray(row.sessions) ? row.sessions[0] : row.sessions) as
        | { session_date?: string | null }
        | null
        | undefined;
      return { id: row.id, date: session?.session_date ?? "" };
    })
    .filter((s) => s.date && s.date.slice(0, 10) >= todayStr);

  /* =========================
     DASHBOARD VIEW
     ========================= */
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 sm:p-8 sm:space-y-8">
      {/* SESSION FULL BANNER */}
      {sessionFull === "1" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
          <span className="text-xl">📋</span>
          <div>
            <p className="font-semibold text-sm">This session is already full.</p>
            <p className="text-xs text-amber-600 mt-0.5">Don&apos;t worry — you will be considered for the next available session.</p>
          </div>
        </div>
      )}

      {/* TURNED DOWN A WAITLIST OFFER */}
      {waitlistDeclined === "1" && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-700 shadow-sm">
          <span className="text-xl">✓</span>
          <div>
            <p className="font-semibold text-sm">No problem — you&apos;re not on the waitlist.</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Nothing is expected of you for this session, and it doesn&apos;t affect future invitations.
            </p>
          </div>
        </div>
      )}

      {/* ACCEPTED ONTO THE WAITLIST */}
      {waitlisted === "1" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <span className="text-xl">⏳</span>
          <div>
            <p className="font-semibold text-sm">You&apos;re on the waitlist for this session.</p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              It was already full, so you have a reserve spot rather than a confirmed seat. Join at
              the start time and wait in the Zoom waiting room — if a spot opens you&apos;ll be
              admitted and paid {formatCents(HOURLY_RATE_CENTS)} per hour for the full session. If
              no spot opens within {WAITLIST_HOLD_MINUTES} minutes you may leave, and you&apos;ll
              still be paid {formatCents(WAITLIST_WAIT_FEE_CENTS)} for waiting.
            </p>
          </div>
        </div>
      )}

      {/* SESSION ALREADY STARTED */}
      {sessionStarted === "1" && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-700 shadow-sm">
          <span className="text-xl">🕒</span>
          <div>
            <p className="font-semibold text-sm">This session has already started.</p>
            <p className="text-xs text-slate-500 mt-0.5">Invitations close when the session begins, so it can no longer be accepted.</p>
          </div>
        </div>
      )}

      {/* NOT AN ACTIVE PANEL MEMBER */}
      {inactive === "1" && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-orange-800 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-sm">Your account is not active, so you cannot attend a session.</p>
            <p className="text-xs text-orange-600 mt-0.5">
              We do not have a current confirmation that you are still interested in
              participating. Please confirm using the &ldquo;Yes, I&rsquo;m still
              interested&rdquo; button in our reactivation email, or contact us.
            </p>
          </div>
        </div>
      )}

      {missingProfile && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-800 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-sm">You cannot accept this invitation until your profile is complete.</p>
            <p className="text-xs text-red-600 mt-0.5">
              Please update your{" "}
              {missingProfile.split(",").map((f, i, arr) => (
                <span key={f}>
                  {f === "dl" ? "Driver's License (number & photo)" : "PayPal username"}
                  {i < arr.length - 1 ? " and " : ""}
                </span>
              ))}
              {" "}in your profile, then try again.
            </p>
            <Link href="/dashboard/participant/edit" className="text-xs font-semibold underline mt-1 inline-block">
              Update Profile →
            </Link>
          </div>
        </div>
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
            {pendingInvites.map((invite) => {
              const session = (Array.isArray(invite.sessions) ? invite.sessions[0] : invite.sessions) as
                | InviteSession
                | null
                | undefined;
              const cases = session?.session_cases ?? [];
              const startTimes = cases.map((c) => c.start_time).filter((v): v is string => Boolean(v)).sort();
              const endTimes = cases.map((c) => c.end_time).filter((v): v is string => Boolean(v)).sort();

              const fmtCt = (t: string) => {
                const [h, m] = t.split(":");
                const d = new Date();
                d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
                return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
              };

              const timeLabel =
                startTimes.length && endTimes.length
                  ? `${fmtCt(startTimes[0])} – ${fmtCt(endTimes[endTimes.length - 1])} (CT)`
                  : "TBD";

              // Invitations close when the first case begins. Declining stays
              // open; the server enforces the same rule in updateInviteStatus.
              const started = hasSessionStarted(session?.session_date, startTimes);
              // Drives the concrete "about $90 for this session" figure on the
              // waitlist offer, so the rate is not left as arithmetic.
              const offerHours = sessionLengthHours(startTimes, endTimes);

              return (
                <form
                  key={invite.id}
                  className="flex items-center justify-between border p-4 rounded-lg"
                >
                  <div>
                    <p className="font-medium">Session Invite</p>
                    <p className="text-sm text-slate-500">Date: {session?.session_date}</p>
                    <p className="text-sm text-slate-500">Time: {timeLabel}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {started ? (
                      <span className="max-w-[15rem] text-right text-xs italic text-slate-500">
                        This session has already started, so it can no longer be accepted.
                      </span>
                    ) : offerFor === invite.id ? (
                      /* Seats went while this invitation sat unanswered. Ask
                         before committing them to a reserve slot. */
                      <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-900">
                          This session is now full — we can offer you a waitlist spot
                        </p>
                        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-900">
                          <li>• Hold in the Zoom waiting room up to {WAITLIST_HOLD_MINUTES} minutes.</li>
                          <li>• Admitted <strong>only</strong> if a confirmed participant doesn&apos;t show.</li>
                          <li>
                            • Called in: <strong>{formatCents(HOURLY_RATE_CENTS)}/hour</strong>
                            {offerHours > 0
                              ? <> — about <strong>{formatCents(seatPayoutCents(offerHours))}</strong> for this session</>
                              : null}.
                          </li>
                          <li>• Not called in: <strong>{formatCents(WAITLIST_WAIT_FEE_CENTS)}</strong> for waiting.</li>
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            formAction={async () => {
                              "use server";
                              await updateInviteStatus(invite.id, "accepted", { confirmWaitlist: true });
                              redirect("/dashboard/participant?waitlisted=1");
                            }}
                            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                          >
                            Yes, add me to the waitlist
                          </button>
                          <button
                            formAction={async () => {
                              "use server";
                              await updateInviteStatus(invite.id, "declined", { waitlistOfferDeclined: true });
                              redirect("/dashboard/participant?waitlistDeclined=1");
                            }}
                            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                          >
                            No thanks
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">Nothing is saved until you choose.</p>
                      </div>
                    ) : (
                      <button
                        formAction={async () => {
                          "use server";
                          const result = await updateInviteStatus(invite.id, "accepted");
                          if (result && "needsWaitlistConsent" in result && result.needsWaitlistConsent) {
                            redirect(`/dashboard/participant?waitlistOffer=${invite.id}`);
                          }
                          if (result && "blocked" in result && result.blocked) {
                            if (result.reason === "missing_profile") {
                              const missing = (result as { missing?: string[] }).missing ?? [];
                              redirect(`/dashboard/participant?missingProfile=${missing.join(",")}`);
                            }
                            if (result.reason === "inactive") {
                              redirect("/dashboard/participant?inactive=1");
                            }
                            if (result.reason === "session_started") {
                              redirect("/dashboard/participant?sessionStarted=1");
                            }
                            redirect("/dashboard/participant?sessionFull=1");
                          }
                          // Seats were gone — they took a reserve slot, which
                          // needs saying out loud rather than a silent refresh.
                          if (result && "waitlisted" in result && result.waitlisted) {
                            redirect("/dashboard/participant?waitlisted=1");
                          }
                          revalidatePath("/dashboard/participant");
                        }}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                      >
                        Accept
                      </button>
                    )}

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
              );
            })}
          </div>
        </section>
      )}

      {/* WAITLIST SLOTS */}
      {waitlistedSessions.length > 0 && (
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Waitlist</h2>
          <div className="space-y-4">
            {waitlistedSessions.map((s) => (
              <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-amber-900">
                      {new Date(s.date).toLocaleDateString("en-US", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800">
                      You are on the waitlist. Join at the start time and wait in the Zoom waiting
                      room. If a spot opens you will be admitted and paid{" "}
                      {formatCents(HOURLY_RATE_CENTS)} per hour for the full session. If no spot
                      opens within {WAITLIST_HOLD_MINUTES} minutes you may leave, and you will
                      still be paid {formatCents(WAITLIST_WAIT_FEE_CENTS)} for waiting.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500 text-white">
                    Waitlisted
                  </span>
                </div>
                <Link
                  href="/dashboard/participant/sessions"
                  className="mt-2 inline-block text-xs font-semibold text-amber-900 underline"
                >
                  View session details &rarr;
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NO ACTIVE SESSIONS — ONBOARDING DIRECTIONS */}
      {pendingInvites.length === 0 && waitlistedSessions.length === 0 && (
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