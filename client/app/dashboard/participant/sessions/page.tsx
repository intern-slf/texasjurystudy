import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { getPendingInvites } from "@/lib/participant/getPendingInvites";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";
import { hasSessionStarted } from "@/lib/participant/sessionStart";
import {
  WAITLISTED_STATUS,
  OFFLINE_ARRIVE_EARLY_MINUTES,
  isWaitlisted,
  waitlistHoldMinutes,
  waitlistWaitFeeCents,
  formatCents,
  hourlyRateCents,
  sessionLengthHours,
  seatPayoutCents,
} from "@/lib/participant/waitlist";
import {
  deliveryModeLabel,
  isOffline,
  sessionDeliveryModeOrDefault,
} from "@/lib/case/deliveryMode";

export default async function ParticipantSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionFull?: string; missingProfile?: string; sessionStarted?: string; waitlisted?: string; waitlistOffer?: string; waitlistDeclined?: string }>;
}) {
  noStore();
  const { sessionFull, missingProfile, sessionStarted, waitlisted, waitlistOffer, waitlistDeclined } = await searchParams;
  /** Invite id currently being offered a waitlist slot, if any. */
  const offerFor = waitlistOffer ?? null;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: participant } = await supabase
    .from("jury_participants")
    .select("user_id")
    .eq("user_id", user.id)
    .single();

  if (!participant) redirect("/dashboard/participant");

  /* =========================
     FETCH PENDING INVITES
  ========================= */
  const pendingInvites = await getPendingInvites(participant.user_id);

  /* =========================
     FETCH ACCEPTED SESSIONS
  ========================= */
  // Waitlisted rows are included: the person committed to the date, holds the
  // Zoom link, and would otherwise see nothing here at all.
  const { data: acceptedInvites } = await supabaseAdmin
    .from("session_participants")
    .select("id, session_id, invite_status, sessions(session_date, zoom_link, location, session_cases(start_time, end_time, cases(title, delivery_mode)))")
    .eq("participant_id", participant.user_id)
    .in("invite_status", ["accepted", WAITLISTED_STATUS]);

  const fmtCt = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type SessionCaseRow = {
    start_time?: string | null;
    end_time?: string | null;
    cases?: CaseRow | CaseRow[] | null;
  };
  type CaseRow = { title?: string | null; delivery_mode?: string | null };
  type SessionRow = {
    session_date?: string | null;
    zoom_link?: string | null;
    /** Street address of an in-person session; the offline twin of zoom_link. */
    location?: string | null;
    session_cases?: SessionCaseRow[] | null;
  };

  /** The one mode shared by a session's cases — see lib/case/deliveryMode. */
  const modeOf = (sessionCases: SessionCaseRow[]) =>
    sessionDeliveryModeOrDefault(
      sessionCases.map((c) => {
        const detail = Array.isArray(c.cases) ? c.cases[0] : c.cases;
        return detail?.delivery_mode ?? null;
      }),
    );

  const sessions = (acceptedInvites ?? [])
    .flatMap((inv) => {
      const session = (Array.isArray(inv.sessions) ? inv.sessions[0] : inv.sessions) as SessionRow | null | undefined;
      const date: string = session?.session_date ?? "";
      if (!date) return [];

      const sessionCases: SessionCaseRow[] = session?.session_cases ?? [];
      const starts = sessionCases.map((c) => c.start_time).filter((v): v is string => Boolean(v)).sort();
      const ends   = sessionCases.map((c) => c.end_time).filter((v): v is string => Boolean(v)).sort();
      const timeRange = starts.length && ends.length
        ? `${fmtCt(starts[0])} – ${fmtCt(ends[ends.length - 1])} (CT)`
        : "TBD";

      const caseTitles = sessionCases
        .map((c) => {
          const caseDetail = Array.isArray(c.cases) ? c.cases[0] : c.cases;
          return caseDetail?.title as string | undefined;
        })
        .filter(Boolean) as string[];

      const deliveryMode = modeOf(sessionCases);
      const zoomLink: string | null = session?.zoom_link ?? null;
      const location: string | null = session?.location ?? null;

      return [{
        sessionId: inv.session_id,
        date,
        displayDate: new Date(date).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        }),
        timeRange,
        caseTitles,
        deliveryMode,
        zoomLink,
        location,
        waitlisted: isWaitlisted(inv.invite_status),
        isPast: new Date(date) < today,
      }];
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upcoming = sessions.filter((s) => !s.isPast);
  const past     = sessions.filter((s) => s.isPast);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 sm:p-8 sm:space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Sessions</h1>
        <BackButton href="/dashboard/participant" label="Back to Dashboard" />
      </div>

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
      {/* The redirect carries the delivery mode ("online" | "offline"), not a
          flag — the banner below quotes that session's own hold window and fee. */}
      {waitlisted && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
          <span className="text-xl">⏳</span>
          <div>
            <p className="font-semibold text-sm">You&apos;re on the waitlist for this session.</p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              It was already full, so you have a reserve spot rather than a confirmed seat. Join at
              {isOffline(waitlisted)
                ? ` the venue ${OFFLINE_ARRIVE_EARLY_MINUTES} minutes before the start time and wait on site`
                : " the start time and wait in the Zoom waiting room"} — if a spot opens you&apos;ll be
              admitted and paid {formatCents(hourlyRateCents(waitlisted))} per hour for the full
              session. If no spot opens within {waitlistHoldMinutes(waitlisted)} minutes you may
              leave, and you&apos;ll still be paid {formatCents(waitlistWaitFeeCents(waitlisted))}{" "}
              for waiting.
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

      {missingProfile && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-800 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-sm">You cannot accept this invitation until your profile is complete.</p>
            <p className="text-xs text-red-600 mt-0.5">
              Please update your{" "}
              {missingProfile.split(",").map((f, i, arr) => (
                <span key={f}>
                  {f === "dl" ? "Texas State ID (number & photo)" : "PayPal username"}
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

      {/* REQUESTED (PENDING INVITES) */}
      {pendingInvites.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Requested
          </h2>
          {pendingInvites.map((invite) => {
            const session = (Array.isArray(invite.sessions) ? invite.sessions[0] : invite.sessions) as SessionRow | null | undefined;
            const date: string = session?.session_date ?? "";
            const sessionCases: SessionCaseRow[] = session?.session_cases ?? [];
            const starts = sessionCases.map((c) => c.start_time).filter((v): v is string => Boolean(v)).sort();
            const ends = sessionCases.map((c) => c.end_time).filter((v): v is string => Boolean(v)).sort();
            const timeRange = starts.length && ends.length
              ? `${fmtCt(starts[0])} – ${fmtCt(ends[ends.length - 1])} (CT)`
              : "TBD";
            const displayDate = date
              ? new Date(date).toLocaleDateString("en-US", {
                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                })
              : "Date TBD";

            // Invitations close when the first case begins. Declining stays
            // open; the server enforces the same rule in updateInviteStatus.
            const started = hasSessionStarted(date, starts);
            // Drives the concrete "about $90 for this session" figure on the
            // waitlist offer, so the rate is not left as arithmetic.
            const sessionHoursFor = sessionLengthHours(starts, ends);
            const offerMode = modeOf(sessionCases);

            return (
              <form
                key={invite.id}
                className="border rounded-xl p-5 space-y-3 border-amber-200 bg-amber-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-base text-amber-900">{displayDate}</p>
                    <p className="text-sm mt-0.5 text-amber-700">{timeRange}</p>
                    {/* Accepting an in-person session commits them to a
                        journey. Stated before the Accept button, not only in
                        the invitation email. */}
                    {(() => {
                      const mode = modeOf(sessionCases);
                      return (
                        <p className="mt-1 text-xs text-amber-800">
                          <span className="font-semibold">{deliveryModeLabel(mode)}</span>
                          {isOffline(mode)
                            ? ` — you attend at a venue, paid ${formatCents(hourlyRateCents(mode))}/hr. Address sent after you accept.`
                            : ` — you join over Zoom, paid ${formatCents(hourlyRateCents(mode))}/hr.`}
                        </p>
                      );
                    })()}
                  </div>
                  <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-600 text-white">
                    Pending
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {started ? (
                    <span className="text-xs italic text-amber-800">
                      This session has already started, so it can no longer be accepted.
                    </span>
                  ) : offerFor === invite.id ? (
                    /* Seats went while this invitation sat unanswered. Ask before
                       committing them to a reserve slot — the invitation promised
                       a seat, so a silent waitlist would be a bait and switch. */
                    <div className="w-full rounded-lg border border-amber-300 bg-white p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        This session is now full — we can offer you a waitlist spot
                      </p>
                      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-900">
                        <li>
                          {isOffline(offerMode)
                            ? `Come to the venue ${OFFLINE_ARRIVE_EARLY_MINUTES} min early and hold on site up to ${waitlistHoldMinutes(offerMode)} minutes.`
                            : `Join Zoom at the start time and hold in the waiting room up to ${waitlistHoldMinutes(offerMode)} minutes.`}
                        </li>
                        <li>• You are admitted <strong>only</strong> if a confirmed participant does not show up.</li>
                        <li>
                          • Called in: <strong>{formatCents(hourlyRateCents(offerMode))}/hour</strong>
                          {sessionHoursFor > 0
                            ? <> — about <strong>{formatCents(seatPayoutCents(sessionHoursFor, offerMode))}</strong> for this session</>
                            : null}.
                        </li>
                        <li>• Not called in: <strong>{formatCents(waitlistWaitFeeCents(offerMode))}</strong> for waiting.</li>
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          formAction={async () => {
                            "use server";
                            const confirmed = await updateInviteStatus(invite.id, "accepted", { confirmWaitlist: true });
                            redirect(`/dashboard/participant/sessions?waitlisted=${confirmed?.deliveryMode ?? "online"}`);
                          }}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          Yes, add me to the waitlist
                        </button>
                        <button
                          formAction={async () => {
                            "use server";
                            await updateInviteStatus(invite.id, "declined", { waitlistOfferDeclined: true });
                            redirect("/dashboard/participant/sessions?waitlistDeclined=1");
                          }}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          No thanks
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Nothing is saved until you choose.
                      </p>
                    </div>
                  ) : (
                    <button
                      formAction={async () => {
                        "use server";
                        const result = await updateInviteStatus(invite.id, "accepted");
                        if (result && "needsWaitlistConsent" in result && result.needsWaitlistConsent) {
                          redirect(`/dashboard/participant/sessions?waitlistOffer=${invite.id}`);
                        }
                        if (result && "blocked" in result && result.blocked) {
                          if (result.reason === "missing_profile") {
                            const missing = (result as { missing?: string[] }).missing ?? [];
                            redirect(`/dashboard/participant/sessions?missingProfile=${missing.join(",")}`);
                          }
                          if (result.reason === "session_started") {
                            redirect("/dashboard/participant/sessions?sessionStarted=1");
                          }
                          redirect("/dashboard/participant/sessions?sessionFull=1");
                        }
                        // Seats were gone — they took a reserve slot, which needs
                        // saying out loud rather than a silent refresh.
                        if (result && "waitlisted" in result && result.waitlisted) {
                          redirect(`/dashboard/participant/sessions?waitlisted=${result.deliveryMode}`);
                        }
                        revalidatePath("/dashboard/participant/sessions");
                      }}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold"
                    >
                      Accept
                    </button>
                  )}

                  <button
                    formAction={async () => {
                      "use server";
                      await updateInviteStatus(invite.id, "declined");
                      revalidatePath("/dashboard/participant/sessions");
                    }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-semibold"
                  >
                    Decline
                  </button>
                </div>
              </form>
            );
          })}
        </section>
      )}

      {sessions.length === 0 && pendingInvites.length === 0 && (
        <div className="bg-white border rounded-xl p-10 text-center text-slate-400 italic">
          You have no confirmed sessions yet.
        </div>
      )}

      {/* UPCOMING */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Upcoming
          </h2>
          {upcoming.map((s) => (
            <SessionCard key={s.sessionId} session={s} />
          ))}
        </section>
      )}

      {/* PAST */}
      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Past
          </h2>
          {past.map((s) => (
            <SessionCard key={s.sessionId} session={s} isPast />
          ))}
        </section>
      )}
    </div>
  );
}

function SessionCard({
  session,
  isPast = false,
}: {
  session: {
    displayDate: string;
    timeRange: string;
    caseTitles: string[];
    deliveryMode?: string | null;
    zoomLink?: string | null;
    /** Street address, for an in-person session. */
    location?: string | null;
    /** Holding a reserve slot rather than a confirmed seat. */
    waitlisted?: boolean;
  };
  isPast?: boolean;
}) {
  const waitlisted = Boolean(session.waitlisted);
  const offline = isOffline(session.deliveryMode);
  return (
    <div
      className={`border rounded-xl p-5 space-y-3 ${
        isPast
          ? "border-slate-200 bg-slate-50 opacity-75"
          : offline
          ? "border-green-200 bg-green-50"
          : "border-blue-200 bg-blue-50"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`font-semibold text-base ${
              isPast ? "text-slate-600" : offline ? "text-green-900" : "text-blue-900"
            }`}
          >
            {session.displayDate}
          </p>
          <p
            className={`text-sm mt-0.5 ${
              isPast ? "text-slate-500" : offline ? "text-green-700" : "text-blue-700"
            }`}
          >
            {session.timeRange}
          </p>

          {/* How to attend. An in-person session shows the address; an online
              one the Zoom link. Never both — they are mutually exclusive, and
              showing a stale Zoom link on an in-person session is how someone
              ends up at their desk instead of at the venue. */}
          {!isPast && offline && session.location && (
            <div className="mt-2">
              <p className="text-xs font-bold uppercase tracking-wide text-green-700">Where</p>
              <p className="text-sm font-semibold text-green-900 whitespace-pre-line">
                {session.location}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z" fill="white" />
                  <circle cx="12" cy="10" r="2.6" fill="#16a34a" />
                </svg>
                Get Directions
              </a>
              <p className="mt-2 text-xs text-green-800">
                Arrive {OFFLINE_ARRIVE_EARLY_MINUTES} minutes early and bring your Texas State ID.
              </p>
            </div>
          )}
          {!isPast && offline && !session.location && (
            <p className="mt-2 text-xs text-green-800">
              This session is <strong>in person</strong>. We will email you the address before the
              session date.
            </p>
          )}
          {!isPast && !offline && session.zoomLink && (
            <a
              href={session.zoomLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-[#2D8CFF] text-white text-xs font-semibold hover:bg-[#1a7aee] transition-colors"
            >
              {/* Zoom icon */}
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 10.25V13.75L17.5 15.5V8.5L14.5 10.25Z" fill="white"/>
                <rect x="6.5" y="8.5" width="7" height="7" rx="1.5" fill="white"/>
              </svg>
              Join Zoom Meeting
            </a>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              isPast
                ? "bg-slate-200 text-slate-600"
                : waitlisted
                ? "bg-amber-500 text-white"
                : offline
                ? "bg-green-600 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            {isPast ? "Completed" : waitlisted ? "Waitlisted" : "Confirmed"}
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
              offline
                ? "text-green-700 bg-white border-green-300"
                : "text-blue-700 bg-white border-blue-300"
            }`}
          >
            {deliveryModeLabel(session.deliveryMode)}
          </span>
        </div>
      </div>

      {/* A waitlister holds a reserve slot, so the rules and the two possible
          payments are spelled out wherever they see the session. */}
      {waitlisted && !isPast && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900">
            You are on the waitlist for this session.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {offline
              ? `Arrive ${OFFLINE_ARRIVE_EARLY_MINUTES} minutes early and wait on site.`
              : "Join at the start time and wait in the Zoom waiting room."}{" "}
            If a confirmed participant does not show up you will be admitted and paid the standard{" "}
            {formatCents(hourlyRateCents(session.deliveryMode))} per hour for the full session. If no
            spot opens within {waitlistHoldMinutes(session.deliveryMode)} minutes you are free to
            leave, and you will still be paid{" "}
            {formatCents(waitlistWaitFeeCents(session.deliveryMode))} for waiting.
          </p>
        </div>
      )}
    </div>
  );
}
