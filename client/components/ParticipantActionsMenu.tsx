"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminRespondOnBehalf,
  flagParticipant,
  callInWaitlistParticipant,
  markWaitlistWaitedOut,
} from "@/lib/actions/session";
import { isWaitlisted, WAITLIST_HOLD_MINUTES } from "@/lib/participant/waitlist";

interface Props {
  sessionId: string;
  participantId: string;
  participantName: string;
  /** Raw `session_participants.invite_status` — gates the waitlist actions. */
  inviteStatus?: string | null;
  /** `session_participants.waitlist_outcome` once an admin has recorded one. */
  waitlistOutcome?: string | null;
}

type ModalKind = "accepted" | "rejected" | "flag" | "call_in" | "waited_out";

export default function ParticipantActionsMenu({
  sessionId,
  participantId,
  participantName,
  inviteStatus,
  waitlistOutcome,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The waitlist actions only make sense while the row is still holding a
  // reserve slot. A call-in flips the status to 'accepted', so the options
  // disappear on their own once one has been used.
  const onWaitlist = isWaitlisted(inviteStatus);
  const outcomeRecorded = Boolean(waitlistOutcome);

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
      if (modal === "flag") {
        await flagParticipant(participantId, sessionId);
      } else if (modal === "call_in") {
        await callInWaitlistParticipant(sessionId, participantId);
      } else if (modal === "waited_out") {
        await markWaitlistWaitedOut(sessionId, participantId);
      } else {
        await adminRespondOnBehalf(sessionId, participantId, modal);
      }
      setModal(null);
    } finally {
      setLoading(false);
    }
  }

  const COPY: Record<ModalKind, { title: string; body: string; confirm: string; tone: string }> = {
    accepted: {
      title: "Accept & Send Confirmation Email",
      body: `This will mark ${participantName}'s attendance as accepted and send them a confirmation email with the session date and time.`,
      confirm: "Accept & Send Mail",
      tone: "bg-green-600 hover:bg-green-700",
    },
    rejected: {
      title: "Decline on Behalf",
      body: `This will mark ${participantName}'s invitation as declined. Confirmation email will be sent.`,
      confirm: "Decline",
      tone: "bg-red-600 hover:bg-red-700",
    },
    flag: {
      title: "Strike Participant",
      body: `This adds a strike to ${participantName} for not attending / backing out of this session. They will show as "Striked" on this session and on any case that ran in it. At 3 strikes they are automatically blacklisted and can no longer be invited to future sessions. No email is sent.`,
      confirm: "Add Strike",
      tone: "bg-amber-600 hover:bg-amber-700",
    },
    call_in: {
      title: "Call In From Waitlist",
      body: `This moves ${participantName} off the waitlist into a full seat for this session. They are paid the standard hourly rate for the whole session instead of the waiting fee, and are emailed to confirm it. Do this once you have admitted them from the Zoom waiting room. Note this deliberately goes past the participant cap — the seat belongs to whoever did not show up.`,
      confirm: "Call In",
      tone: "bg-green-600 hover:bg-green-700",
    },
    waited_out: {
      title: "Record: Waited, Not Called",
      body: `This records that ${participantName} held their waitlist slot for the full ${WAITLIST_HOLD_MINUTES} minutes and was never called in. They are paid the flat waiting fee, emailed a thank-you, and stay eligible for future sessions.`,
      confirm: "Record Waiting Fee",
      tone: "bg-blue-600 hover:bg-blue-700",
    },
  };

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
            {onWaitlist && (
              <div className="border-b border-slate-100">
                <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Waitlist
                </p>
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 text-green-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={outcomeRecorded}
                  onClick={() => { setModal("call_in"); setOpen(false); }}
                >
                  Call in from waitlist
                </button>
                <button
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 text-blue-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={outcomeRecorded}
                  onClick={() => { setModal("waited_out"); setOpen(false); }}
                >
                  Waited, not called
                </button>
                {outcomeRecorded && (
                  <p className="px-4 pb-2 text-[11px] text-slate-400">
                    Outcome already recorded.
                  </p>
                )}
              </div>
            )}
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
            <button
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 text-amber-700 border-t border-slate-100"
              onClick={() => { setModal("flag"); setOpen(false); }}
            >
              Strike participant
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">{COPY[modal].title}</h3>
            <p className="text-sm text-slate-600 mb-6">{COPY[modal].body}</p>
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
                className={`px-4 py-2 text-sm text-white rounded ${COPY[modal].tone}`}
              >
                {loading ? "Processing..." : COPY[modal].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
