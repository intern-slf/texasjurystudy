"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { rejectCaseAction } from "@/lib/actions/adminCase";

interface Props {
  caseId: string;
}

export function RejectCaseButton({ caseId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleReject() {
    if (!reason.trim()) return;
    startTransition(async () => {
      await rejectCaseAction(caseId, reason.trim());
      setOpen(false);
      setReason("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition-all font-medium flex items-center justify-center min-w-[80px]"
      >
        Reject
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Reject Case
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Please provide a reason for rejecting this case. This will be sent
              to the presenter via email.
            </p>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setReason("");
                }}
                disabled={isPending}
                className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending || !reason.trim()}
                className="text-sm px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  "Reject Case"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
