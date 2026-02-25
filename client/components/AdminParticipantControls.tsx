"use client";

import { useState, useTransition } from "react";
import {
  verifyParticipant,
  blacklistParticipant,
  unblacklistParticipant,
} from "@/lib/actions/adminParticipant";

type Props = {
  userId: string;
  approvedByAdmin: boolean | null;
  blacklistedAt: string | null;
};

export default function AdminParticipantControls({ userId, approvedByAdmin, blacklistedAt }: Props) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"default" | "blacklist">("default");
  const [reason, setReason] = useState("");

  const isBlacklisted = !!blacklistedAt;
  const isVerified = !isBlacklisted && !!approvedByAdmin;
  const isNew = !isBlacklisted && !approvedByAdmin;

  function handleVerify() {
    startTransition(async () => {
      await verifyParticipant(userId);
    });
  }

  function handleBlacklist() {
    if (!reason.trim()) return;
    startTransition(async () => {
      await blacklistParticipant(userId, reason.trim());
      setMode("default");
      setReason("");
    });
  }

  function handleUnblacklist() {
    startTransition(async () => {
      await unblacklistParticipant(userId);
    });
  }

  return (
    <div className="space-y-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Status:</span>
        {isBlacklisted && (
          <span className="inline-flex items-center rounded-full bg-red-400/10 px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-400/20">
            Blacklisted
          </span>
        )}
        {isVerified && (
          <span className="inline-flex items-center rounded-full bg-green-400/10 px-2.5 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-400/20">
            Verified
          </span>
        )}
        {isNew && (
          <span className="inline-flex items-center rounded-full bg-yellow-400/10 px-2.5 py-1 text-xs font-medium text-yellow-600 ring-1 ring-inset ring-yellow-400/20">
            Pending Review
          </span>
        )}
      </div>

      {/* Actions */}
      {mode === "default" ? (
        <div className="flex flex-wrap gap-3">
          {/* Blacklisted → Send back to requests */}
          {isBlacklisted && (
            <button
              onClick={handleUnblacklist}
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              {isPending ? "Processing…" : "Send to Requests"}
            </button>
          )}

          {/* New → Verify + Blacklist */}
          {isNew && (
            <>
              <button
                onClick={handleVerify}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                {isPending ? "Verifying…" : "✓ Verify"}
              </button>
              <button
                onClick={() => setMode("blacklist")}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                ✕ Blacklist
              </button>
            </>
          )}

          {/* Verified → Blacklist */}
          {isVerified && (
            <button
              onClick={() => setMode("blacklist")}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              ✕ Blacklist
            </button>
          )}
        </div>
      ) : (
        /* Blacklist reason form */
        <div className="space-y-3 max-w-sm">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Reason for blacklisting
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason…"
            rows={3}
            autoFocus
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={handleBlacklist}
              disabled={isPending || !reason.trim()}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              {isPending ? "Processing…" : "Confirm Blacklist"}
            </button>
            <button
              onClick={() => { setMode("default"); setReason(""); }}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
