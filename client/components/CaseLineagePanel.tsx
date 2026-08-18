import Link from "next/link";
import ParticipantRoster from "@/components/ParticipantRoster";
import { getFullCaseChain } from "@/lib/case-lineage";

/**
 * The follow-up chain a case belongs to: root case → follow-ups, with the
 * participants each one used. Participants anywhere in this chain are blocked
 * from future follow-ups (see `getBlockedParticipantIds`), so the distinct
 * count across the chain is the number of people already "spent" on this matter.
 */
export default async function CaseLineagePanel({ caseId }: { caseId: string }) {
  const chain = await getFullCaseChain(caseId);

  if (chain.length === 0) {
    return (
      <section className="bg-white p-5 rounded-xl border shadow-sm sm:p-8">
        <h3 className="text-xl font-bold mb-2">Case History</h3>
        <p className="text-sm text-slate-400 italic">No lineage information available.</p>
      </section>
    );
  }

  const distinctParticipants = new Set(
    chain.flatMap((node) => node.participants.map((p) => p.id))
  );
  const currentIndex = chain.findIndex((node) => node.id === caseId);

  return (
    <section className="bg-white p-5 rounded-xl border shadow-sm sm:p-8 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xl font-bold">Case History</h3>
        <p className="text-xs text-slate-500">
          {chain.length === 1
            ? "Standalone case — no follow-ups"
            : `${chain.length} cases in chain · this is #${currentIndex + 1}`}
          {distinctParticipants.size > 0 &&
            ` · ${distinctParticipants.size} distinct participant${
              distinctParticipants.size === 1 ? "" : "s"
            } used`}
        </p>
      </div>

      {chain.length > 1 && (
        <p className="text-xs text-slate-500 bg-slate-50 border rounded-lg px-4 py-2.5">
          Everyone listed below is excluded from future follow-ups of this case, so
          each new round draws fresh participants.
        </p>
      )}

      <div>
        {chain.map((node, idx) => {
          const isCurrent = node.id === caseId;
          const isLast = idx === chain.length - 1;

          return (
            <div key={node.id} className="relative flex gap-4">
              {/* Chain connector */}
              <div className="flex flex-col items-center w-4 shrink-0">
                <div
                  className={`w-3 h-3 rounded-full border-2 mt-2 shrink-0 ${
                    isCurrent ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"
                  }`}
                />
                {!isLast && <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />}
              </div>

              {/* Node */}
              <div className="flex-1 pb-5 min-w-0">
                <div
                  className={`rounded-xl border p-4 space-y-3 ${
                    isCurrent ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {isCurrent ? (
                        <span className="font-semibold text-slate-800 truncate">
                          {node.title}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/Admin/${node.id}`}
                          className="font-semibold text-blue-600 hover:underline truncate"
                        >
                          {node.title}
                        </Link>
                      )}
                      {idx === 0 && chain.length > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          Original
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium">
                          Current
                        </span>
                      )}
                      <CaseStatusBadge status={node.status} adminStatus={node.admin_status} />
                    </div>

                    <span className="text-xs text-slate-500 shrink-0">
                      {new Date(node.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" · "}
                      {node.participants.length} participant
                      {node.participants.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {node.participants.length > 0 && (
                    <ParticipantRoster
                      variant="chips"
                      caseId={node.id}
                      isPast={node.status === "previous"}
                      participants={node.participants.map((p) => ({
                        id: p.id,
                        name:
                          `${p.first_name} ${p.last_name}`.trim() || "Unnamed participant",
                        inviteStatus: p.invite_status,
                        struck: p.struck,
                      }))}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CaseStatusBadge({
  status,
  adminStatus,
}: {
  status: string;
  adminStatus: string;
}) {
  const base = "text-[10px] px-1.5 py-0.5 rounded font-medium";

  if (status === "previous") {
    return <span className={`${base} bg-slate-100 text-slate-600`}>Past</span>;
  }
  if (adminStatus === "approved" || adminStatus === "submitted") {
    return <span className={`${base} bg-green-50 text-green-700`}>Approved</span>;
  }
  if (adminStatus === "rejected") {
    return <span className={`${base} bg-red-50 text-red-700`}>Rejected</span>;
  }
  return <span className={`${base} bg-amber-50 text-amber-700`}>Pending</span>;
}
