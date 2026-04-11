"use client";

import { useState, useTransition } from "react";
import { updateSessionParticipantCap } from "@/lib/actions/session";

export default function SessionCapEditor({
  sessionId,
  currentCap,
}: {
  sessionId: string;
  currentCap: number;
}) {
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState(currentCap);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (cap < 1) return;
    startTransition(async () => {
      await updateSessionParticipantCap(sessionId, cap);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-slate-500 hover:text-blue-600 transition-colors"
        title="Click to edit participant cap"
      >
        Cap: {currentCap}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        value={cap}
        onChange={(e) => setCap(Number(e.target.value))}
        className="w-16 text-xs border rounded px-1.5 py-0.5"
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={isPending || cap < 1}
        className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "..." : "Save"}
      </button>
      <button
        onClick={() => { setCap(currentCap); setEditing(false); }}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        Cancel
      </button>
    </div>
  );
}
