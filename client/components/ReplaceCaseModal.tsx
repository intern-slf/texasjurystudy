"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { replaceCaseInSession } from "@/lib/actions/session";
import { deliveryModeLabel, type DeliveryMode } from "@/lib/case/deliveryMode";

export interface ReplacementCandidate {
  id: string;
  title: string;
  deliveryMode: DeliveryMode;
}

interface ReplaceCaseModalProps {
  sessionId: string;
  oldCaseId: string;
  oldCaseTitle: string;
  startTime: string;
  endTime: string;
  sessionDate: string;
  /** Already narrowed to this session's mode by the caller. */
  candidates: ReplacementCandidate[];
  /** The session's mode, shown so an empty list explains itself. */
  deliveryMode: DeliveryMode;
}

export default function ReplaceCaseModal({
  sessionId,
  oldCaseId,
  oldCaseTitle,
  startTime,
  endTime,
  sessionDate,
  candidates,
  deliveryMode,
}: ReplaceCaseModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleReplace = async () => {
    if (!selectedId) return;
    setIsPending(true);
    setError("");
    try {
      await replaceCaseInSession(sessionId, oldCaseId, selectedId, startTime, endTime, sessionDate);
      setIsOpen(false);
      router.refresh();
    } catch (err: unknown) {
      // The server rejects a mode mismatch outright, and it checks before
      // detaching the old case — so a failure here leaves the session intact.
      setError(err instanceof Error ? err.message : "Replace failed. Please try again.");
    } finally {
      setIsPending(false);
    }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-4">
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
                  onChange={(e) => { setSelectedId(e.target.value); setError(""); }}
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
                  No unscheduled {deliveryModeLabel(deliveryMode).toLowerCase()} cases available for
                  replacement.
                </p>
              )}
              <p className="text-xs text-slate-400">
                Only {deliveryModeLabel(deliveryMode).toLowerCase()} cases are listed — a session
                cannot mix in-person and online cases.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

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
