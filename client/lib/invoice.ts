import { calculateReceiptPrice, formatCents } from "@/lib/receipt-pricing";
import { bookingState, firmLabel, paymentDueAt, type SlotBookingRow } from "@/lib/slotBooking";
import {
  SLOT_TIME_ZONE_LABEL,
  formatDateKey,
  formatSlotRange,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";
import { isOffline } from "@/lib/case/deliveryMode";
import { OFFLINE_VENUE } from "@/lib/constants/offline-catchment";
import type { CaseSessionTime } from "@/lib/case/caseSessionTime";
import type { CaseFilters } from "@/lib/filter-utils";

/**
 * The invoice a law firm gets for a case (app/invoice/[caseId]). Nothing here
 * touches the database, so the page and the tests share it.
 *
 * Every amount comes from calculateReceiptPrice, the same numbers the firm saw
 * in "Receipt Value" when it created the case, row for row: the base hours at
 * the case's rate, then one row per filter. Like the receipt, it prices the
 * case's hours and filters as they are now.
 */

export type InvoiceCase = {
  id: string;
  title: string;
  filters: CaseFilters | null;
  hours_requested: number | null;
  delivery_mode: string | null;
  approved_at: string | null;
  created_at: string | null;
};

/** past (held, unpaid, its time has come) reads as overdue on an invoice. */
export type InvoiceStatus = "paid" | "unpaid" | "overdue";

export type InvoiceLine = {
  description: string;
  /** Muted lines under the description: when and where. */
  details: string[];
  /** "2 hours × $850.00/hr", as the receipt words it. Null for a flat fee. */
  quantity: string | null;
  amountCents: number;
};

export type InvoiceView = {
  number: string;
  /** When the invoice is dated: when the firm took the time, else when the case was approved, else created. */
  issuedAt: string | null;
  /** When payment is (or was) due, while unpaid. Null when no payment clock is running. */
  dueAt: string | null;
  paidAt: string | null;
  status: InvoiceStatus;
  billedTo: { name: string; email: string | null };
  lines: InvoiceLine[];
  totalCents: number;
};

const DATE_WITH_YEAR: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

/** "INV-3F9A12BC": the case id's first 8 characters, so it never changes and needs no column. */
export function invoiceNumber(caseId: string): string {
  return `INV-${caseId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function invoiceStatus(
  booking: Pick<SlotBookingRow, "held_since" | "paid_at"> | null,
  slot: Pick<TimeSlot, "starts_at"> | null,
  dueAt: Date | null,
  nowMs: number
): InvoiceStatus {
  if (booking?.paid_at) return "paid";
  if (booking && slot) return bookingState(slot, booking, nowMs) === "unpaid" ? "unpaid" : "overdue";
  return dueAt && nowMs >= dueAt.getTime() ? "overdue" : "unpaid";
}

export function buildInvoice({
  theCase,
  booking,
  slot,
  sessionTime,
  firm,
  nowMs,
}: {
  theCase: InvoiceCase;
  booking: Pick<SlotBookingRow, "held_since" | "paid_at"> | null;
  slot: Pick<TimeSlot, "starts_at" | "ends_at"> | null;
  sessionTime: Pick<CaseSessionTime, "sessionDate" | "time"> | null;
  firm: { name: string | null; email: string | null };
  nowMs: number;
}): InvoiceView {
  const breakdown = calculateReceiptPrice(theCase.filters, theCase.hours_requested, theCase.delivery_mode);
  const offline = isOffline(breakdown.deliveryMode);

  // The exact time once the case is in a session, else the time the firm holds:
  // "Thu, Oct 29, 2026 · 9:00 AM – 12:00 PM CT". With the year, as an invoice is kept.
  const when = sessionTime
    ? `${formatDateKey(sessionTime.sessionDate, DATE_WITH_YEAR)}${sessionTime.time ? ` · ${sessionTime.time}` : ""}`
    : slot
      ? `${formatDateKey(slotDateKey(slot.starts_at), DATE_WITH_YEAR)} · ${formatSlotRange(slot)} ${SLOT_TIME_ZONE_LABEL}`
      : null;
  const where = offline ? `${OFFLINE_VENUE.name} · ${OFFLINE_VENUE.address}` : null;

  const lines: InvoiceLine[] = [
    {
      description: `${offline ? "In-person" : "Online"} focus group — ${theCase.title}`,
      details: [when, where].filter((d): d is string => !!d),
      quantity: `${breakdown.hours} ${breakdown.hours === 1 ? "hour" : "hours"} × ${formatCents(
        breakdown.baseRatePerHourCents
      )}/hr`,
      amountCents: breakdown.baseCostCents,
    },
    ...breakdown.filterItems.map((item) => ({
      description: `${item.label} filter`,
      details: [],
      quantity: null,
      amountCents: item.costCents,
    })),
  ];

  const paidAt = booking?.paid_at ?? null;
  const due = booking?.held_since && !paidAt ? paymentDueAt(booking.held_since) : null;

  return {
    number: invoiceNumber(theCase.id),
    issuedAt: booking?.held_since ?? theCase.approved_at ?? theCase.created_at,
    dueAt: due ? due.toISOString() : null,
    paidAt,
    status: invoiceStatus(booking, slot, due, nowMs),
    billedTo: { name: firmLabel(firm.name, firm.email), email: firm.email },
    lines,
    totalCents: breakdown.totalCostCents,
  };
}
