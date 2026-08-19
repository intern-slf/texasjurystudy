import type { LineageInvolvement } from "@/lib/case-lineage";

/**
 * History badge for someone who was invited to a case's follow-up chain before
 * but never actually sat on it — they declined, never answered, or accepted and
 * were then struck. Informational only: these people stay fully selectable, and
 * the blocking involvements ("accepted", "pending-upcoming") never reach here —
 * they are greyed out as "Already used" instead.
 */
const COPY: Partial<Record<LineageInvolvement, { label: string; title: string }>> = {
  declined: {
    label: "Previously invited — declined",
    title:
      "Invited to an earlier case in this follow-up chain and turned it down. They never sat on the case, so they can be invited again.",
  },
  "no-response": {
    label: "Previously invited — no response",
    title:
      "Invited to an earlier case in this follow-up chain and never answered before the session passed. They never sat on the case, so they can be invited again.",
  },
  struck: {
    label: "Previously invited — struck",
    title:
      "Accepted an earlier case in this follow-up chain, then backed out or did not attend. They never sat on the case, so they can be invited again.",
  },
};

export default function PriorInvolvementBadge({
  involvement,
}: {
  involvement?: LineageInvolvement | null;
}) {
  const entry = involvement ? COPY[involvement] : undefined;
  if (!entry) return null;

  return (
    <span
      title={entry.title}
      className="px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-slate-100 text-slate-600 border-slate-300"
    >
      {entry.label}
    </span>
  );
}
