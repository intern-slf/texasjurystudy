"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { replaceCaseInSession } from "@/lib/actions/session";

export interface ReplacementCandidate {
  id: string;
  title: string;
}

interface ReplaceCaseModalProps {
  sessionId: string;
  oldCaseId: string;
  oldCaseTitle: string;
  startTime: string;
  endTime: string;
  sessionDate: string;
  candidates: ReplacementCandidate[];
}

export default function ReplaceCaseModal({
  sessionId,
  oldCaseId,
  oldCaseTitle,
  startTime,
  endTime,
  sessionDate,
  candidates,
}: ReplaceCaseModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleReplace = async () => {
    if (!selectedId) return;
    setIsPending(true);
    await replaceCaseInSession(sessionId, oldCaseId, selectedId, startTime, endTime, sessionDate);
    setIsOpen(false);
    setIsPending(false);
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-semibold px-2 py-0.5 rounded border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
      >
        Replace
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Replace Case</h2>
            <p className="text-sm text-slate-500">
              Replacing: <span className="font-medium text-slate-700">{oldCaseTitle}</span>
            </p>
            <p className="text-xs text-slate-400">
              Time slot: {startTime} → {endTime} on {sessionDate}
            </p>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Select replacement case
              </label>
              {candidates.length ? (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="">-- Choose a case --</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  No accepted cases available for replacement.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setIsOpen(false); setSelectedId(""); }}
                className="px-4 py-2 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReplace}
                disabled={!selectedId || isPending}
                className="px-4 py-2 text-sm rounded bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Replacing..." : "Confirm Replace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
