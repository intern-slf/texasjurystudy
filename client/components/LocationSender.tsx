"use client";

import { useState, useTransition } from "react";
import { sendSessionLocation } from "@/lib/actions/session";

interface Props {
  sessionId: string;
  existingLocation?: string | null;
}

/**
 * The in-person counterpart to ZoomLinkSender. Shown instead of it — never
 * alongside — because a session is either online or in person, and offering both
 * controls would invite an admin to send people a link to a room they are
 * supposed to drive to.
 *
 * A textarea rather than an input: venue addresses run to several lines, and the
 * email renders them with `white-space: pre-line` so the line breaks survive.
 */
export default function LocationSender({ sessionId, existingLocation }: Props) {
  const [location, setLocation] = useState(existingLocation ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!location.trim()) {
      setError("Please enter the venue address before sending.");
      return;
    }
    const fd = new FormData();
    fd.append("sessionId", sessionId);
    fd.append("location", location.trim());

    startTransition(async () => {
      try {
        await sendSessionLocation(fd);
        setSent(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to send. Please try again.");
      }
    });
  }

  return (
    <div className="border border-green-100 rounded-lg bg-green-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {/* Map pin */}
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z"
            fill="#16a34a"
          />
          <circle cx="12" cy="10" r="2.6" fill="white" />
        </svg>
        <span className="text-sm font-semibold text-slate-800">
          Send Location to Accepted Participants
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 border border-green-200 rounded px-1.5 py-0.5">
          In-Person
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          rows={3}
          placeholder={"Venue name\n1234 Main Street, Suite 200\nHouston, TX 77002"}
          value={location}
          onChange={(e) => { setLocation(e.target.value); setSent(false); setError(""); }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:ring-2 focus:ring-green-300"
          disabled={isPending}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || sent}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              sent
                ? "bg-green-500 cursor-default"
                : isPending
                ? "bg-green-400 cursor-wait"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {sent ? "Sent ✓" : isPending ? "Sending…" : "Send to All"}
          </button>
        </div>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {sent && (
        <p className="text-xs text-green-700 font-medium">
          Location sent to all accepted participants.
        </p>
      )}
      {!sent && existingLocation && (
        <p className="text-xs text-slate-500">
          A location is already saved for this session. Sending again re-mails it to everyone
          who has accepted.
        </p>
      )}
    </div>
  );
}
