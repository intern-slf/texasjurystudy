"use client";

import { useState, useTransition } from "react";
import { notifyPresenterByEmail } from "@/lib/actions/session";

interface Props {
  sessionId: string;
  alreadyNotified: boolean;
}

export default function NotifyPresenterModal({ sessionId, alreadyNotified }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(alreadyNotified);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter a presenter email address.");
      return;
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        await notifyPresenterByEmail(sessionId, trimmed);
        setSent(true);
        setOpen(false);
        setEmail("");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to send. Please try again.");
      }
    });
  }

  if (sent) {
    return (
      <button disabled className="px-4 py-2 rounded text-sm text-white bg-gray-400 cursor-not-allowed">
        Already Notified
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded text-sm text-white bg-green-600 hover:bg-green-700"
      >
        Notify Presenter
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Notify Presenter</h3>
              <button
                onClick={() => { setOpen(false); setError(""); }}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <p className="text-sm text-slate-500">
              Enter the presenter&apos;s email address. They will receive the Zoom link, Google Drive links, and accepted participants&apos; demographic information.
            </p>

            <div className="space-y-2">
              <label htmlFor="presenter-email" className="text-sm font-medium text-slate-700">
                Presenter Email
              </label>
              <input
                id="presenter-email"
                type="email"
                placeholder="presenter@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
                disabled={isPending}
                autoFocus
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setOpen(false); setError(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isPending || !email.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                  isPending
                    ? "bg-green-400 cursor-wait"
                    : "bg-green-600 hover:bg-green-700 disabled:opacity-40"
                }`}
              >
                {isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
