"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleSession } from "@/lib/actions/session";
import { CENTRAL_TIME_ZONE, utcTimeToLocal } from "@/lib/timezone";
import { caseMinutes, formatMinutes, paidMinutes, paidTimeProblem, storedCaseMinutes } from "@/lib/case/paidTime";

interface CaseEntry {
  case_id: string;
  title: string;
  start_time: string;
  end_time: string;
  /** What the firm asked for, which is what it pays for (lib/case/paidTime.ts). */
  hours_requested?: number | null;
}

interface Props {
  sessionId: string;
  sessionDate: string;
  cases: CaseEntry[];
}

export default function RescheduleModal({ sessionId, sessionDate, cases }: Props) {
  // The inputs are Central Time, which rescheduleSession saves them as: in the
  // admin's own zone, moving a session across a clock change without touching
  // the times kept the admin's clock, not Texas's, and everyone was emailed it.
  const toCentral = (utcTime: string) => utcTimeToLocal(sessionDate, utcTime, CENTRAL_TIME_ZONE);

  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(sessionDate);
  const [times, setTimes] = useState<Record<string, { start: string; end: string }>>(
    Object.fromEntries(
      cases.map((c) => [c.case_id, { start: toCentral(c.start_time), end: toCentral(c.end_time) }])
    )
  );
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Each case runs no longer than its firm paid for. One that already ran longer,
  // from before that was checked, may keep its length but not grow.
  // rescheduleSession checks the same before it writes anything.
  const problems: Record<string, string | null> = Object.fromEntries(
    cases.map((c) => {
      const t = times[c.case_id];
      const problem =
        date && t
          ? paidTimeProblem(
              c.title,
              caseMinutes(date, t.start, t.end),
              c.hours_requested,
              storedCaseMinutes(sessionDate, c.start_time, c.end_time) ?? 0,
            )
          : null;
      return [c.case_id, problem];
    }),
  );
  const hasProblem = Object.values(problems).some(Boolean);

  /** A case still running longer than it was paid for, which it may only keep: say so. */
  const overPaid = (c: CaseEntry): string | null => {
    const t = times[c.case_id];
    const minutes = date && t ? caseMinutes(date, t.start, t.end) : null;
    const paid = paidMinutes(c.hours_requested);
    return minutes !== null && minutes > paid && !problems[c.case_id]
      ? `Runs ${formatMinutes(minutes)}, longer than the ${formatMinutes(paid)} paid for, as it did before. It can be shortened, not lengthened.`
      : null;
  };

  function handleOpen() {
    // Reset to current values each time modal opens
    setDate(sessionDate);
    setTimes(
      Object.fromEntries(
        cases.map((c) => [c.case_id, { start: toCentral(c.start_time), end: toCentral(c.end_time) }])
      )
    );
    setDone(false);
    setError("");
    setIsOpen(true);
  }

  function handleTimeChange(caseId: string, field: "start" | "end", value: string) {
    setTimes((prev) => ({ ...prev, [caseId]: { ...prev[caseId], [field]: value } }));
  }

  function handleSubmit() {
    const caseUpdates = cases.map((c) => ({
      caseId: c.case_id,
      start: times[c.case_id]?.start ?? c.start_time,
      end: times[c.case_id]?.end ?? c.end_time,
    }));
    setError("");
    startTransition(async () => {
      try {
        await rescheduleSession(sessionId, date, caseUpdates);
      } catch {
        // Production hides a server action's error text, so say what to do.
        setError("The session couldn't be rescheduled. Refresh the page to see what was saved, then try again.");
        return;
      }
      setDone(true);
      router.refresh();
      setTimeout(() => {
        setIsOpen(false);
        setDone(false);
      }, 1500);
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-3 py-1.5 rounded text-sm font-medium text-white bg-amber-600 hover:bg-amber-700"
      >
        Reschedule
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-800">Reschedule Session</h2>

            {/* Date picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                New Session Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Case time inputs */}
            {cases.length > 0 && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Case Times (Central Time)
                </label>
                {cases.map((c) => (
                  <div key={c.case_id} className="border rounded px-3 py-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.title}</p>
                      <p className="text-xs text-slate-400 shrink-0">
                        Paid for {formatMinutes(paidMinutes(c.hours_requested))}
                      </p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400">Start (CT)</label>
                        <input
                          type="time"
                          value={times[c.case_id]?.start ?? c.start_time}
                          onChange={(e) => handleTimeChange(c.case_id, "start", e.target.value)}
                          className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <span className="text-slate-400 mt-4">→</span>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400">End (CT)</label>
                        <input
                          type="time"
                          value={times[c.case_id]?.end ?? c.end_time}
                          onChange={(e) => handleTimeChange(c.case_id, "end", e.target.value)}
                          className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    </div>
                    {problems[c.case_id] && (
                      <p className="text-xs text-red-600">{problems[c.case_id]}</p>
                    )}
                    {overPaid(c) && <p className="text-xs text-amber-700">{overPaid(c)}</p>}
                  </div>
                ))}
              </div>
            )}

            {done && (
              <p className="text-sm text-green-600 font-medium text-center">
                Session rescheduled and notifications sent!
              </p>
            )}
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="px-4 py-2 rounded text-sm border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || !date || hasProblem}
                className="px-4 py-2 rounded text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Reschedule & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
