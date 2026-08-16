import Link from "next/link";
import LocalTimeRange from "@/components/LocalTimeRange";
import { getCaseSessions } from "@/lib/case/getCaseSessions";
import ParticipantRoster from "@/components/ParticipantRoster";

/**
 * Sessions scheduled for a case plus the roster for each — who was invited, who
 * accepted, and how the accepted count sits against the session cap.
 */
export default async function CaseSessionsPanel({ caseId }: { caseId: string }) {
  const sessions = await getCaseSessions(caseId);

  return (
    <section className="bg-white p-8 rounded-xl border shadow-sm space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-bold">Sessions &amp; Participants</h3>
        <Link href="/dashboard/Admin/sessions" className="text-xs text-blue-600 hover:underline">
          Manage sessions →
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          No session scheduled for this case yet.
        </p>
      ) : (
        sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`rounded-xl border p-5 space-y-4 ${
              s.isPast ? "border-slate-200 bg-slate-50/60" : "border-blue-200 bg-blue-50/30"
            }`}
          >
            {/* SESSION HEADER */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">{s.displayDate}</p>
                <p className="text-sm mt-0.5">
                  {s.startTime && s.endTime ? (
                    <LocalTimeRange
                      sessionDate={s.date}
                      startUtc={s.startTime}
                      endUtc={s.endTime}
                    />
                  ) : (
                    <span className="text-slate-400">Time TBD</span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    s.acceptedCount >= s.participantCap
                      ? "bg-green-400/10 text-green-600 ring-green-400/20"
                      : "bg-slate-400/10 text-slate-600 ring-slate-400/20"
                  }`}
                >
                  Accepted {s.acceptedCount} / {s.participantCap}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    s.isPast
                      ? "bg-slate-400/10 text-slate-600 ring-slate-400/20"
                      : "bg-blue-400/10 text-blue-600 ring-blue-400/20"
                  }`}
                >
                  {s.isPast ? "Completed" : "Upcoming"}
                </span>
                {s.zoomLink ? (
                  <a
                    href={s.zoomLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#2D8CFF] hover:underline"
                  >
                    Zoom link
                  </a>
                ) : (
                  <span className="text-xs text-amber-600">No Zoom link yet</span>
                )}
              </div>
            </div>

            {/* ROSTER */}
            <ParticipantRoster
              participants={s.participants.map((p) => ({
                id: p.id,
                name: p.name,
                email: p.email,
                inviteStatus: p.inviteStatus,
              }))}
              caseId={caseId}
              isPast={s.isPast}
            />
          </div>
        ))
      )}
    </section>
  );
}
