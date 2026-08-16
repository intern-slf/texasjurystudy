"use client";

import { useState } from "react";
import Link from "next/link";
import InviteStatusBadge from "@/components/InviteStatusBadge";

/**
 * A participant list ordered accepted-first, collapsed to the first few until
 * expanded. Used for both the session roster (rows) and the lineage chips, so
 * a long case reads at a glance instead of pushing everything off-screen.
 */

export type RosterParticipant = {
  /** `session_participants.participant_id` — links to the participant profile. */
  id: string;
  name: string;
  email?: string;
  inviteStatus: string;
};

const DEFAULT_VISIBLE = 3;

export default function ParticipantRoster({
  participants,
  caseId,
  isPast = false,
  variant = "rows",
  initialVisible = DEFAULT_VISIBLE,
}: {
  participants: RosterParticipant[];
  caseId: string;
  isPast?: boolean;
  variant?: "rows" | "chips";
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (participants.length === 0) {
    return <p className="text-xs text-slate-400 italic">No participants invited.</p>;
  }

  const byName = (a: RosterParticipant, b: RosterParticipant) => a.name.localeCompare(b.name);
  const accepted = participants.filter((p) => p.inviteStatus === "accepted").sort(byName);
  const others = participants.filter((p) => p.inviteStatus !== "accepted").sort(byName);

  const ordered = [...accepted, ...others];
  const visible = expanded ? ordered : ordered.slice(0, initialVisible);
  const visibleAccepted = visible.filter((p) => p.inviteStatus === "accepted");
  const visibleOthers = visible.filter((p) => p.inviteStatus !== "accepted");

  // Headings only earn their space when there's actually a split to show.
  const showHeadings = accepted.length > 0 && others.length > 0;
  const canToggle = ordered.length > initialVisible;

  const href = (p: RosterParticipant) =>
    `/dashboard/participant/${p.id}?from=case&caseId=${caseId}`;

  const toggle = canToggle && (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
    >
      {expanded
        ? "Show fewer"
        : `Show all ${ordered.length} participant${ordered.length === 1 ? "" : "s"}`}
      <span className={`text-[10px] transition-transform ${expanded ? "rotate-180" : ""}`}>
        ▼
      </span>
    </button>
  );

  /* =========================
     CHIPS (lineage)
     ========================= */
  if (variant === "chips") {
    const chips = (group: RosterParticipant[]) => (
      <div className="flex flex-wrap gap-2">
        {group.map((p) => (
          <Link
            key={p.id}
            href={href(p)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-1.5 py-1 hover:bg-slate-50 transition-colors"
          >
            <span className="text-xs font-medium text-slate-700">{p.name}</span>
            <InviteStatusBadge status={p.inviteStatus} isPast={isPast} />
          </Link>
        ))}
      </div>
    );

    return (
      <div className="space-y-2">
        {visibleAccepted.length > 0 && (
          <>
            {showHeadings && <GroupLabel label="Accepted" count={accepted.length} />}
            {chips(visibleAccepted)}
          </>
        )}
        {visibleOthers.length > 0 && (
          <>
            {showHeadings && <GroupLabel label="Other" count={others.length} />}
            {chips(visibleOthers)}
          </>
        )}
        {toggle}
      </div>
    );
  }

  /* =========================
     ROWS (session roster)
     ========================= */
  const rows = (group: RosterParticipant[]) => (
    <div className="divide-y divide-slate-100">
      {group.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
        >
          <div className="min-w-0">
            <Link
              href={href(p)}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {p.name}
            </Link>
            {p.email && <p className="text-xs text-slate-400 truncate">{p.email}</p>}
          </div>
          <InviteStatusBadge status={p.inviteStatus} isPast={isPast} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {visibleAccepted.length > 0 && (
          <>
            {showHeadings && <GroupBar label="Accepted" count={accepted.length} />}
            {rows(visibleAccepted)}
          </>
        )}
        {visibleOthers.length > 0 && (
          <>
            {showHeadings && <GroupBar label="Other" count={others.length} />}
            {rows(visibleOthers)}
          </>
        )}
      </div>
      {toggle}
    </div>
  );
}

function GroupBar({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-slate-50 border-y border-slate-100 first:border-t-0 px-4 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label} ({count})
      </span>
    </div>
  );
}

function GroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label} ({count})
    </p>
  );
}
