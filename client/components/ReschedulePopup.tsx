"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X, CheckCircle, XCircle } from "lucide-react";

export interface RescheduleItem {
  id: string;          // localStorage key (sessionId or caseId)
  actionId: string;    // ID passed to the server action (inviteRecordId or caseId)
  title: string;
  newDate: string;     // raw value stored in localStorage for comparison
  displayDate: string; // human-readable
}

interface Props {
  items: RescheduleItem[];
  role: "participant" | "presenter";
  onAccept: (actionId: string) => Promise<void>;
  onDecline: (actionId: string) => Promise<void>;
}

export default function ReschedulePopup({ items, role, onAccept, onDecline }: Props) {
  const [visible, setVisible] = useState<RescheduleItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [actingOn, setActingOn] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unseen = items.filter((item) => {
      const stored = localStorage.getItem(`reschedule_seen_${item.id}`);
      return stored !== item.newDate;
    });
    setVisible(unseen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function markSeen(item: RescheduleItem) {
    localStorage.setItem(`reschedule_seen_${item.id}`, item.newDate);
    setVisible((prev) => prev.filter((i) => i.id !== item.id));
  }

  function dismissAll() {
    visible.forEach((item) =>
      localStorage.setItem(`reschedule_seen_${item.id}`, item.newDate)
    );
    setVisible([]);
  }

  function handleAction(item: RescheduleItem, type: "accept" | "decline") {
    setActingOn(item.id);
    startTransition(async () => {
      if (type === "accept") await onAccept(item.actionId);
      else await onDecline(item.actionId);
      markSeen(item);
      router.refresh();
      setActingOn(null);
    });
  }

  if (visible.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {role === "presenter" ? "Session Schedule Updated" : "Session Rescheduled"}
              </h2>
              <p className="text-xs text-slate-500">
                {role === "presenter"
                  ? "Please confirm your availability for the new date."
                  : "A session you joined has been moved. Confirm or decline below."}
              </p>
            </div>
          </div>
          <button
            onClick={dismissAll}
            disabled={isPending}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {visible.map((item) => {
            const isActing = actingOn === item.id && isPending;
            return (
              <div
                key={item.id}
                className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3"
              >
                <div>
                  <p className="text-sm font-semibold text-amber-900">{item.title}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    New date: <span className="font-medium">{item.displayDate}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(item, "accept")}
                    disabled={isActing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {isActing ? "Saving…" : "Accept"}
                  </button>
                  <button
                    onClick={() => handleAction(item, "decline")}
                    disabled={isActing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {isActing ? "Saving…" : "Decline"}
                  </button>
                  <button
                    onClick={() => markSeen(item)}
                    disabled={isActing}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Later
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={dismissAll}
          disabled={isPending}
          className="w-full px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
}
