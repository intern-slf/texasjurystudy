import Link from "next/link";
import InviteStatusBadge from "@/components/InviteStatusBadge";
import {
  getParticipantSessionHistory,
  type ParticipantSessionRow,
} from "@/lib/participant/getParticipantSessionHistory";

/**
 * Admin-only panel on the participant profile: every session they were invited
 * to, how they responded, and which cases ran in it. Renders nothing for
 * non-admins — the helper returns null unless the caller is an admin.
 */
export default async function ParticipantSessionHistory({
  participantIds,
}: {
  participantIds: string[];
}) {
  const history = await getParticipantSessionHistory(participantIds);
  if (!history) return null;

  const { past, upcoming, stats } = history;

  return (
    <section className="bg-white border rounded-xl p-6 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-lg">Session History</h2>
        {stats.lastAttendedDate && (
          <span className="text-xs text-slate-500">
            Last attended: {stats.lastAttendedDate}
          </span>
        )}
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Invited" value={stats.invited} />
        <Stat label="Attended" value={stats.attended} tone="green" />
        <Stat label="Upcoming" value={stats.upcoming} tone="blue" />
        <Stat label="Declined" value={stats.declined} tone="amber" />
        <Stat label="No response" value={stats.noResponse} tone="red" />
        <Stat label="Striked" value={stats.struck} tone="orange" />
      </div>

      {stats.invited === 0 && (
        <p className="text-sm text-slate-400 italic">
          This participant has never been invited to a session.
        </p>
      )}

      {/* UPCOMING */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Upcoming ({upcoming.length})
          </h3>
          {upcoming.map((s) => (
            <SessionRow key={s.sessionId} session={s} />
          ))}
        </div>
      )}

      {/* PAST */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Past ({past.length})
          </h3>
          {past.map((s) => (
            <SessionRow key={s.sessionId} session={s} isPast />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "blue" | "amber" | "red" | "orange";
}) {
  const toneClass =
    value === 0
      ? "text-slate-400"
      : {
          slate: "text-slate-700",
          green: "text-green-600",
          blue: "text-blue-600",
          amber: "text-amber-600",
          red: "text-red-600",
          orange: "text-orange-600",
        }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className={`text-xl font-bold leading-tight ${toneClass}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function SessionRow({
  session,
  isPast = false,
}: {
  session: ParticipantSessionRow;
  isPast?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 ${
        isPast ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/40"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{session.displayDate}</p>
        <p className="text-xs text-slate-500 mt-0.5">{session.timeRange}</p>

        {session.cases.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
            {session.cases.map((c) =>
              c.id ? (
                <Link
                  key={c.id}
                  href={`/dashboard/Admin/${c.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {c.title}
                </Link>
              ) : (
                <span key={c.title} className="text-xs text-slate-500">
                  {c.title}
                </span>
              )
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic mt-1.5">No case attached</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <InviteStatusBadge
          status={session.inviteStatus}
          isPast={isPast}
          struck={Boolean(session.struckAt)}
        />
        {session.respondedAt && (
          <span className="text-[11px] text-slate-400">
            Responded{" "}
            {new Date(session.respondedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
