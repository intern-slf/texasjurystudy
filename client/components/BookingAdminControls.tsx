"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelBooking, markBookingPaid, markBookingUnpaid, moveBooking } from "@/lib/actions/adminSlotBooking";
import { describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";
import type { BookingView } from "@/lib/slotBooking";

type Props = {
  booking: BookingView;
  /** Free slots the booking can move to, earliest first. */
  openSlots: TimeSlot[];
  /** The open times couldn't be read, so an empty openSlots doesn't mean there are none. */
  openSlotsUnavailable?: boolean;
  /** Called after a change that takes the booking off this slot (moved or released). */
  onLeftSlot?: () => void;
};

const SELECT_CLASSES =
  "h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** Mark paid / unpaid, move, and release, for one booked slot. Shared by the calendar and the case page. */
export default function BookingAdminControls({ booking, openSlots, openSlotsUnavailable = false, onLeftSlot }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  // Releasing for non-payment is only offered once the deadline has passed, so
  // the firm is never told it didn't pay while it still could.
  const releaseReason = booking.state === "overdue" ? "unpaid" : "other";
  const moveOptions = openSlots.filter((s) => s.id !== booking.slotId);

  function run(action: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>, leavesSlot = false) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
        if (result.warning) setMessage({ tone: "warning", text: result.warning });
        setConfirmingRelease(false);
        setMoveTo("");
        if (leavesSlot) onLeftSlot?.();
        router.refresh();
      } catch (err) {
        console.error("[BookingAdminControls] action failed:", err);
        setMessage({ tone: "error", text: "Something went wrong. Refresh the page and try again." });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {booking.state === "paid" ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => markBookingUnpaid(booking.caseId))}>
            Mark unpaid
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => markBookingPaid(booking.caseId))}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Mark paid
          </Button>
        )}

        {!confirmingRelease ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmingRelease(true)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {releaseReason === "unpaid" ? "Release (not paid)" : "Release"}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              {releaseReason === "unpaid"
                ? "Release it and tell the firm payment didn't arrive?"
                : "Release it and tell the firm?"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => cancelBooking(booking.caseId, booking.slotId, releaseReason), true)}
            >
              {pending ? "Releasing…" : "Yes, release"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirmingRelease(false)}>
              Keep
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={`move-${booking.caseId}`} className="sr-only">
          Move this booking to
        </label>
        <select
          id={`move-${booking.caseId}`}
          value={moveTo}
          onChange={(e) => setMoveTo(e.target.value)}
          disabled={pending || moveOptions.length === 0}
          className={SELECT_CLASSES}
        >
          <option value="">
            {moveOptions.length
              ? "Move to another time…"
              : openSlotsUnavailable
                ? "Open times couldn't be loaded"
                : "No other open times"}
          </option>
          {moveOptions.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {describeSlot(slot)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !moveTo}
          onClick={() => run(() => moveBooking(booking.caseId, booking.slotId, moveTo), true)}
        >
          Move
        </Button>
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-red-600" : "text-sm text-amber-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
