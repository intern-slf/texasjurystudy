import Link from "next/link";
import { BOOKING_STATE_LABEL, formatDeadline, type BookingState, type BookingView } from "@/lib/slotBooking";
import { cn } from "@/lib/utils";

/** Colours for a slot by booking state: chips on the calendar, badges elsewhere. */
export const BOOKING_STATE_CLASSES: Record<BookingState, string> = {
  open: "bg-blue-50 text-blue-700 ring-blue-400/30",
  unpaid: "bg-amber-50 text-amber-800 ring-amber-400/40",
  overdue: "bg-red-50 text-red-700 ring-red-400/40",
  paid: "bg-green-50 text-green-700 ring-green-400/40",
  past: "bg-slate-100 text-slate-600 ring-slate-400/30",
};

export function BookingStateBadge({ state }: { state: BookingState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        BOOKING_STATE_CLASSES[state]
      )}
    >
      {BOOKING_STATE_LABEL[state]}
    </span>
  );
}

/** Who holds a slot, for which case, and where payment stands. */
export default function BookingSummary({ booking, showCaseLink = true }: { booking: BookingView; showCaseLink?: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <BookingStateBadge state={booking.state} />
        <span className="font-medium text-slate-800">{booking.firm}</span>
      </div>

      {showCaseLink && (
        <p className="text-slate-600">
          Case:{" "}
          <Link href={`/dashboard/Admin/${booking.caseId}`} className="font-medium text-blue-700 hover:underline">
            {booking.caseTitle}
          </Link>
        </p>
      )}

      <p className="text-slate-600">
        {booking.state === "paid" && booking.paidAt
          ? `Paid · marked ${formatDeadline(booking.paidAt)}`
          : booking.dueAt
            ? `${booking.state === "overdue" || booking.state === "past" ? "Payment was due" : "Payment due"} ${formatDeadline(booking.dueAt)}`
            : "No payment deadline"}
      </p>

      {booking.warnings.map((warning) => (
        <p key={warning} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {warning}
        </p>
      ))}
    </div>
  );
}
