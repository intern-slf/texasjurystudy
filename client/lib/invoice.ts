import { calculateReceiptPrice, formatCents } from "@/lib/receipt-pricing";
import { bookingState, firmLabel, formatDeadline, paymentDueAt, type SlotBookingRow } from "@/lib/slotBooking";
import { LEGAL_ENTITY, MAILING_ADDRESS, SUPPORT_EMAIL } from "@/lib/legal-constants";
import {
  SLOT_TIME_ZONE_LABEL,
  formatDateKey,
  formatSlotRange,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";
import { normalizeDeliveryMode, type DeliveryMode } from "@/lib/case/deliveryMode";
import { OFFLINE_VENUE } from "@/lib/constants/offline-catchment";
import type { CaseSessionTime } from "@/lib/case/caseSessionTime";
import type { CaseFilters } from "@/lib/filter-utils";
import { discountLabel } from "@/lib/promoCode";

/**
 * The invoice a law firm gets for a case (app/invoice/[caseId]), kept in
 * public.invoices once issued (20261023_invoices.sql). Nothing here touches
 * the database, so lib/invoiceData.ts, the page and the tests share it.
 *
 * Every amount comes from calculateReceiptPrice, the same numbers the firm saw
 * in "Receipt Value" when it created the case, row for row: the base hours at
 * the case's rate, then one row per filter, then the promo discount, if the
 * case has one (lib/promoCode.ts), as a negative amount.
 *
 * An invoice is issued once the case is approved or its firm holds a time. It
 * follows the case while unpaid, so it keeps matching the receipt, and is
 * frozen once paid. If the case is rejected or archived before payment it is
 * voided. Its number and issue date never change.
 */

export type InvoiceCase = {
  id: string;
  title: string;
  filters: CaseFilters | null;
  hours_requested: number | null;
  delivery_mode: string | null;
  admin_status: string | null;
  deleted_at: string | null;
  approved_at: string | null;
};

export type InvoiceLine = {
  description: string;
  /** Muted lines under the description: when and where. */
  details: string[];
  /** "2 hours × $850.00/hr", as the receipt words it. Null for a flat fee. */
  quantity: string | null;
  /** Negative for the discount. */
  amountCents: number;
};

/** What an invoice says, as kept in public.invoices. */
export type InvoiceContent = {
  case_title: string;
  delivery_mode: DeliveryMode;
  billed_to_name: string | null;
  billed_to_email: string | null;
  lines: InvoiceLine[];
  total_cents: number;
};

/** A row of public.invoices. */
export type InvoiceRecord = InvoiceContent & {
  id: string;
  invoice_number: string;
  case_id: string | null;
  issued_at: string;
  revised_at: string | null;
  voided_at: string | null;
};

/** past (held, unpaid, its time has come) reads as overdue on an invoice. */
export type InvoiceStatus = "paid" | "unpaid" | "overdue" | "void";

export type InvoiceView = {
  number: string;
  caseTitle: string;
  issuedAt: string;
  /** When payment is (or was) due, while unpaid. Null when no payment clock is running. */
  dueAt: string | null;
  paidAt: string | null;
  status: InvoiceStatus;
  billedTo: { name: string; email: string | null };
  lines: InvoiceLine[];
  totalCents: number;
};

type Booking = Pick<SlotBookingRow, "held_since" | "paid_at">;

const DATE_WITH_YEAR: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  void: "Void",
};

/** What the total is called, by where payment stands. Shared by the page and the PDF. */
export function invoiceTotalLabel(status: InvoiceStatus): string {
  return status === "paid" ? "Total paid" : status === "void" ? "Total (void)" : "Amount due";
}

/** The line at the foot of the invoice: where payment stands, and who to ask. Shared by the page and the PDF. */
export function invoiceFooterNote(invoice: Pick<InvoiceView, "status" | "dueAt">): string {
  if (invoice.status === "paid") return "This invoice has been paid in full — thank you.";
  if (invoice.status === "void") return `This invoice has been voided — nothing is owed. Questions? Email ${SUPPORT_EMAIL}.`;
  if (invoice.status === "overdue" && invoice.dueAt) {
    return `Payment was due ${formatDeadline(invoice.dueAt)}. Questions? Email ${SUPPORT_EMAIL}.`;
  }
  if (invoice.dueAt) return `Payment is due by ${formatDeadline(invoice.dueAt)}. Questions? Email ${SUPPORT_EMAIL}.`;
  return `Questions about this invoice? Email ${SUPPORT_EMAIL}.`;
}

/**
 * Who a check is made out to and where to mail it, the street and the city a
 * line each, while payment is owed. Null once paid or void, or with no
 * MAILING_ADDRESS. Shared by the page, the PDF and the email.
 */
export function invoiceCheckPayable(status: InvoiceStatus): { payee: string; addressLines: string[] } | null {
  if (status === "paid" || status === "void" || !MAILING_ADDRESS) return null;
  // "402 Simonton St, Conroe, TX 77301" splits at its first comma.
  const comma = MAILING_ADDRESS.indexOf(", ");
  const addressLines = comma < 0 ? [MAILING_ADDRESS] : [MAILING_ADDRESS.slice(0, comma), MAILING_ADDRESS.slice(comma + 2)];
  return { payee: LEGAL_ENTITY, addressLines };
}

/** Rejected or archived: it can't run, so nothing is owed unless it was already paid. */
export function isCancelled(theCase: Pick<InvoiceCase, "admin_status" | "deleted_at">): boolean {
  return theCase.admin_status === "rejected" || !!theCase.deleted_at;
}

/** Whether the case is billed yet: approved, or its firm holds (or held) a time, and not cancelled. */
export function isInvoiceable(theCase: Pick<InvoiceCase, "admin_status" | "deleted_at">, booking: Booking | null): boolean {
  if (isCancelled(theCase)) return false;
  return theCase.admin_status === "approved" || theCase.admin_status === "submitted" || !!booking?.held_since;
}

/** The date a new invoice carries: when the firm took its time, else when the case was approved, else now. */
export function issuedAtFor(theCase: Pick<InvoiceCase, "approved_at">, booking: Booking | null, nowMs: number): string {
  return booking?.held_since ?? theCase.approved_at ?? new Date(nowMs).toISOString();
}

/** What the invoice for this case says, from the case as it is now. */
export function invoiceContent({
  theCase,
  slot,
  sessionTime,
  firm,
  discountPercent = null,
}: {
  theCase: InvoiceCase;
  slot: Pick<TimeSlot, "starts_at" | "ends_at"> | null;
  sessionTime: Pick<CaseSessionTime, "sessionDate" | "time"> | null;
  firm: { name: string | null; email: string | null };
  /** The case's promo discount (public.case_discounts), or null for none. */
  discountPercent?: number | null;
}): InvoiceContent {
  const breakdown = calculateReceiptPrice(
    theCase.filters,
    theCase.hours_requested,
    theCase.delivery_mode,
    discountPercent
  );
  const offline = breakdown.deliveryMode === "offline";

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
  if (breakdown.discountPercent) {
    lines.push({
      description: discountLabel(breakdown.discountPercent),
      details: [],
      quantity: null,
      amountCents: -breakdown.discountCents,
    });
  }

  return {
    case_title: theCase.title,
    delivery_mode: breakdown.deliveryMode,
    billed_to_name: firm.name,
    billed_to_email: firm.email,
    lines,
    total_cents: breakdown.totalCostCents,
  };
}

/** Same lines, field by field: the database hands jsonb back with its keys in its own order. */
function sameLines(a: InvoiceLine[], b: InvoiceLine[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (line, i) =>
        line.description === b[i].description &&
        (line.quantity ?? null) === (b[i].quantity ?? null) &&
        line.amountCents === b[i].amountCents &&
        (line.details ?? []).join("\n") === (b[i].details ?? []).join("\n")
    )
  );
}

export function sameContent(a: InvoiceContent, b: InvoiceContent): boolean {
  return (
    a.case_title === b.case_title &&
    normalizeDeliveryMode(a.delivery_mode) === normalizeDeliveryMode(b.delivery_mode) &&
    (a.billed_to_name ?? null) === (b.billed_to_name ?? null) &&
    (a.billed_to_email ?? null) === (b.billed_to_email ?? null) &&
    a.total_cents === b.total_cents &&
    sameLines(a.lines, b.lines)
  );
}

/**
 * What to do with a case's invoice now:
 *   issue      none yet, and the case is billed
 *   revise     unpaid, and the case has changed (or it was voided and the case is back)
 *   void       unpaid, and the case was rejected or archived
 *   none       nothing: no invoice is due yet, it's paid, or it already matches
 */
export function planInvoice({
  record,
  content,
  theCase,
  booking,
}: {
  record: Pick<InvoiceRecord, keyof InvoiceContent | "voided_at"> | null;
  content: InvoiceContent;
  theCase: Pick<InvoiceCase, "admin_status" | "deleted_at">;
  booking: Booking | null;
}): "issue" | "revise" | "void" | "none" {
  if (!record) return isInvoiceable(theCase, booking) ? "issue" : "none";
  if (booking?.paid_at) return "none";
  if (record.voided_at) return isInvoiceable(theCase, booking) ? "revise" : "none";
  if (isCancelled(theCase)) return "void";
  return sameContent(record, content) ? "none" : "revise";
}

/** The invoice as the page shows it: what it says, and where payment stands now. */
export function invoiceView({
  record,
  booking,
  slot,
  nowMs,
}: {
  record: InvoiceRecord;
  booking: Booking | null;
  slot: Pick<TimeSlot, "starts_at"> | null;
  nowMs: number;
}): InvoiceView {
  const paidAt = booking?.paid_at ?? null;
  const due = !paidAt && !record.voided_at && booking?.held_since ? paymentDueAt(booking.held_since) : null;

  let status: InvoiceStatus;
  if (paidAt) status = "paid";
  else if (record.voided_at) status = "void";
  else if (booking && slot) status = bookingState(slot, booking, nowMs) === "unpaid" ? "unpaid" : "overdue";
  else status = due && nowMs >= due.getTime() ? "overdue" : "unpaid";

  return {
    number: record.invoice_number,
    caseTitle: record.case_title,
    issuedAt: record.issued_at,
    dueAt: due ? due.toISOString() : null,
    paidAt,
    status,
    billedTo: { name: firmLabel(record.billed_to_name, record.billed_to_email), email: record.billed_to_email },
    lines: record.lines,
    totalCents: record.total_cents,
  };
}
