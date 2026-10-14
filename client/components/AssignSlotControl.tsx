"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { assignSlot } from "@/lib/actions/adminSlotBooking";
import { describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";

/** Book one of the open slots for a firm's case, from the admin case page. */
export default function AssignSlotControl({ caseId, openSlots }: { caseId: string; openSlots: TimeSlot[] }) {
  const router = useRouter();
  const [slotId, setSlotId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "warning"; text: string } | null>(null);

  function book() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await assignSlot(caseId, slotId);
        if (!result.ok) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
        if (result.warning) setMessage({ tone: "warning", text: result.warning });
        setSlotId("");
        router.refresh();
      } catch (err) {
        console.error("[AssignSlotControl] assign failed:", err);
        setMessage({ tone: "error", text: "Something went wrong. Refresh the page and try again." });
      }
    });
  }

  if (!openSlots.length) {
    return (
      <p className="text-sm text-slate-500">
        No open time fits this case.{" "}
        <Link href="/dashboard/Admin/requestees/time-slots" className="text-blue-700 hover:underline">
          Add time slots
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`assign-${caseId}`} className="sr-only">
          Book a time for this firm
        </label>
        <select
          id={`assign-${caseId}`}
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          disabled={pending}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Pick an open time…</option>
          {openSlots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {describeSlot(slot)}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={pending || !slotId} onClick={book}>
          {pending ? "Booking…" : "Book for the firm"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">The firm is emailed the time and its payment deadline.</p>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-red-600" : "text-sm text-amber-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
