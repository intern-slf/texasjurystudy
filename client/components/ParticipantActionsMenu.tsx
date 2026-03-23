"use client";

import { useEffect, useRef, useState } from "react";
import { adminRespondOnBehalf } from "@/lib/actions/session";

interface Props {
  sessionId: string;
  participantId: string;
  participantName: string;
}

export default function ParticipantActionsMenu({ sessionId, participantId, participantName }: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"accepted" | "rejected" | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleConfirm() {
    if (!modal) return;
    setLoading(true);
    try {
      await adminRespondOnBehalf(sessionId, participantId, modal);
      setModal(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 text-base leading-none"
          title="More actions"
        >
          •••
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded shadow-lg min-w-[230px]">
            <button
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 text-green-700"
              onClick={() => { setModal("accepted"); setOpen(false); }}
            >
              Accept on behalf of participant
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 text-red-700"
              onClick={() => { setModal("rejected"); setOpen(false); }}
            >
              Decline on behalf of participant
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">
              {modal === "accepted" ? "Accept & Send Confirmation Email" : "Decline on Behalf"}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              {modal === "accepted"
                ? `This will mark ${participantName}'s attendance as accepted and send them a confirmation email with the session date and time.`
                : `This will mark ${participantName}'s invitation as declined. Confirmation email will be sent.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-slate-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className={`px-4 py-2 text-sm text-white rounded ${
                  modal === "accepted"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {loading
                  ? "Processing..."
                  : modal === "accepted"
                  ? "Accept & Send Mail"
                  : "Decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
