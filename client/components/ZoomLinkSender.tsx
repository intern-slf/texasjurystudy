"use client";

import { useRef, useState, useTransition } from "react";
import { sendZoomLink } from "@/lib/actions/session";

interface Props {
  sessionId: string;
  existingZoomLink?: string | null;
}

export default function ZoomLinkSender({ sessionId, existingZoomLink }: Props) {
  const [link, setLink] = useState(existingZoomLink ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!link.trim()) {
      setError("Please paste a Zoom link before sending.");
      return;
    }
    const fd = new FormData();
    fd.append("sessionId", sessionId);
    fd.append("zoomLink", link.trim());

    startTransition(async () => {
      try {
        await sendZoomLink(fd);
        setSent(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to send. Please try again.");
      }
    });
  }

  return (
    <div className="border border-blue-100 rounded-lg bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {/* Zoom logo mark */}
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#2D8CFF"/>
          <path d="M14.5 10.25V13.75L17.5 15.5V8.5L14.5 10.25Z" fill="white"/>
          <rect x="6.5" y="8.5" width="7" height="7" rx="1.5" fill="white"/>
        </svg>
        <span className="text-sm font-semibold text-slate-800">Send Zoom Link to Accepted Participants</span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          placeholder="https://zoom.us/j/..."
          value={link}
          onChange={(e) => { setLink(e.target.value); setSent(false); setError(""); }}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || sent}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
            sent
              ? "bg-green-500 cursor-default"
              : isPending
              ? "bg-blue-400 cursor-wait"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {sent ? "Sent ✓" : isPending ? "Sending…" : "Send to All"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {sent && (
        <p className="text-xs text-green-700 font-medium">
          Zoom link sent to all accepted participants.
        </p>
      )}
    </div>
  );
}
