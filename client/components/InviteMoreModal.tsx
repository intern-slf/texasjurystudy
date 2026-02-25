"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteParticipants } from "@/lib/actions/session";

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  age?: number;
  city?: string;
  political_affiliation?: string;
  matchLevel?: number;
  filterChecks?: {
    key: string;
    label: string;
    passes: boolean;
    detail: string;
    subRows?: string[];
    subTypes?: { label: string; passes: boolean; subRows: string[] }[];
  }[];
}

interface Props {
  sessionId: string;
  sessionDate: string | null;
  candidates: Candidate[];
}

/* ── Reusable filter-check renderer (mirrors sessions/new) ── */
function FilterChecks({ filterChecks, matchLevel }: { filterChecks: Candidate["filterChecks"]; matchLevel?: number }) {
  if (!filterChecks) return null;

  const isExact = matchLevel === 0;
  const badgeClass = isExact
    ? "bg-green-100 text-green-800 border-green-200 hover:bg-green-200"
    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
  const panelClass = isExact
    ? "bg-green-50 border-green-200"
    : "bg-red-50/50 border-red-100";

  return (
    <details className="inline-block">
      <summary
        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold cursor-pointer select-none list-none transition-colors ${badgeClass}`}
      >
        {isExact ? "Exact Match" : "Mismatch Details"}
      </summary>

      <div className={`mt-1 p-2 border rounded text-[10px] space-y-0.5 ${panelClass}`}>
        {filterChecks.map((fc) => (
          <div
            key={fc.key}
            className={`flex flex-col gap-0.5 ${
              isExact ? (fc.passes ? "" : "text-red-500") : (fc.passes ? "text-green-700" : "text-red-500")
            }`}
          >
            {fc.subTypes ? (
              <details className="w-full">
                <summary className="flex gap-1 items-center cursor-pointer list-none">
                  <span>{fc.passes ? "✓" : "✗"}</span>
                  <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                  <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                </summary>
                <div className="ml-4 mt-1 space-y-1">
                  {fc.subTypes.map((st, si) => (
                    <details key={si} className="w-full">
                      <summary
                        className={`flex gap-1 items-center cursor-pointer list-none text-[9px] ${
                          st.passes ? "text-green-700" : "text-red-500"
                        }`}
                      >
                        <span>{st.passes ? "✓" : "✗"}</span>
                        <span className="font-medium underline decoration-dotted">{st.label}</span>
                        <span className="opacity-60 ml-1">(Click)</span>
                      </summary>
                      <ul className="ml-4 mt-0.5 space-y-0.5 text-[9px] bg-white/50 p-1 rounded border border-black/5 text-slate-700">
                        {st.subRows.map((row, ri) => (
                          <li key={ri}>{row}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>
            ) : fc.subRows ? (
              <details className="w-full">
                <summary className="flex gap-1 items-center cursor-pointer list-none">
                  <span>{fc.passes ? "✓" : "✗"}</span>
                  <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                  <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                </summary>
                <ul className="ml-4 mt-1 space-y-0.5 text-[9px] bg-white/50 p-1.5 rounded border border-black/5 text-slate-700">
                  {fc.subRows.map((row, i) => (
                    <li key={i}>{row}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <div className="flex gap-1 items-center">
                <span>{fc.passes ? "✓" : "✗"}</span>
                <span className="font-semibold">{fc.label}:</span>
                <span>{fc.detail}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function InviteMoreModal({ sessionId, sessionDate, candidates }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    if (!selected.size) return;
    startTransition(async () => {
      await inviteParticipants(sessionId, Array.from(selected), sessionDate ?? undefined);
      setIsOpen(false);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700"
      >
        Invite More Participants
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Invite More Participants</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 divide-y">
              {candidates.length === 0 ? (
                <p className="p-6 text-slate-400 italic text-sm text-center">
                  No additional recommended participants found.
                </p>
              ) : (
                candidates.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Age {p.age ?? "N/A"} &bull; {p.city ?? "N/A"} &bull;{" "}
                        {p.political_affiliation ?? "N/A"}
                      </div>
                      <div className="mt-1">
                        <FilterChecks filterChecks={p.filterChecks} matchLevel={p.matchLevel} />
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <span className="text-xs text-slate-500">
                {selected.size} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selected.size || isPending}
                  className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isPending ? "Sending..." : "Send Invites"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
