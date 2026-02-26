"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleSession } from "@/lib/actions/session";
import { utcTimeToLocal } from "@/lib/timezone";

interface CaseEntry {
  case_id: string;
  title: string;
  start_time: string;
  end_time: string;
}

interface Props {
  sessionId: string;
  sessionDate: string;
  cases: CaseEntry[];
}

export default function RescheduleModal({ sessionId, sessionDate, cases }: Props) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const toLocal = (utcTime: string) => utcTimeToLocal(sessionDate, utcTime, tz);

  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(sessionDate);
  const [times, setTimes] = useState<Record<string, { start: string; end: string }>>(
    Object.fromEntries(
      cases.map((c) => [c.case_id, { start: toLocal(c.start_time), end: toLocal(c.end_time) }])
    )
  );
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  function handleOpen() {
    // Reset to current values each time modal opens
    setDate(sessionDate);
    setTimes(
      Object.fromEntries(
        cases.map((c) => [c.case_id, { start: toLocal(c.start_time), end: toLocal(c.end_time) }])
      )
    );
    setDone(false);
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
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    startTransition(async () => {
      await rescheduleSession(sessionId, date, caseUpdates, tz);
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
        className="px-3 py-1.5 rounded text-sm font-medium text-white bg-amber-500 hover:bg-amber-600"
      >
        Reschedule
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
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
                  Case Times
                </label>
                {cases.map((c) => (
                  <div key={c.case_id} className="border rounded px-3 py-3 space-y-2">
                    <p className="text-sm font-medium text-slate-700 truncate">{c.title}</p>
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400">Start</label>
                        <input
                          type="time"
                          value={times[c.case_id]?.start ?? c.start_time}
                          onChange={(e) => handleTimeChange(c.case_id, "start", e.target.value)}
                          className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <span className="text-slate-400 mt-4">→</span>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400">End</label>
                        <input
                          type="time"
                          value={times[c.case_id]?.end ?? c.end_time}
                          onChange={(e) => handleTimeChange(c.case_id, "end", e.target.value)}
                          className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {done && (
              <p className="text-sm text-green-600 font-medium text-center">
                Session rescheduled and notifications sent!
              </p>
            )}

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
                disabled={isPending || !date}
                className="px-4 py-2 rounded text-sm text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
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
