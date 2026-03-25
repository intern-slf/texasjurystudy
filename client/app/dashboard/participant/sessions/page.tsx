import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

export default async function ParticipantSessionsPage() {
  noStore();
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
     FETCH ACCEPTED SESSIONS
  ========================= */
  const { data: acceptedInvites } = await supabaseAdmin
    .from("session_participants")
    .select("id, session_id, sessions(session_date, zoom_link, session_cases(start_time, end_time, cases(title)))")
    .eq("participant_id", participant.user_id)
    .eq("invite_status", "accepted");

  const fmtUtc = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sessions = (acceptedInvites ?? [])
    .flatMap((inv) => {
      const session = Array.isArray(inv.sessions) ? inv.sessions[0] : inv.sessions;
      const date: string = (session as any)?.session_date ?? "";
      if (!date) return [];

      const sessionCases: any[] = (session as any)?.session_cases ?? [];
      const starts = sessionCases.map((c: any) => c.start_time).filter(Boolean).sort();
      const ends   = sessionCases.map((c: any) => c.end_time).filter(Boolean).sort();
      const timeRange = starts.length && ends.length
        ? `${fmtUtc(starts[0])} – ${fmtUtc(ends[ends.length - 1])} (UTC)`
        : "TBD";

      const caseTitles = sessionCases
        .map((c: any) => {
          const caseDetail = Array.isArray(c.cases) ? c.cases[0] : c.cases;
          return caseDetail?.title as string | undefined;
        })
        .filter(Boolean) as string[];

      const zoomLink: string | null = (session as any)?.zoom_link ?? null;

      return [{
        sessionId: inv.session_id,
        date,
        displayDate: new Date(date).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        }),
        timeRange,
        caseTitles,
        zoomLink,
        isPast: new Date(date) < today,
      }];
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upcoming = sessions.filter((s) => !s.isPast);
  const past     = sessions.filter((s) => s.isPast);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Sessions</h1>
        <Link
          href="/dashboard/participant"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {sessions.length === 0 && (
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
    zoomLink?: string | null;
  };
  isPast?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-5 space-y-3 ${
        isPast
          ? "border-slate-200 bg-slate-50 opacity-75"
          : "border-blue-200 bg-blue-50"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-semibold text-base ${isPast ? "text-slate-600" : "text-blue-900"}`}>
            {session.displayDate}
          </p>
          <p className={`text-sm mt-0.5 ${isPast ? "text-slate-500" : "text-blue-700"}`}>
            {session.timeRange}
          </p>

          {/* Zoom link — only for upcoming sessions that have a link */}
          {!isPast && session.zoomLink && (
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
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            isPast ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white"
          }`}
        >
          {isPast ? "Completed" : "Confirmed"}
        </span>
      </div>

    </div>
  );
}
