import Link from "next/link";
import { CreditCard, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDeadline } from "@/lib/slotBooking";
import { SLOT_TIME_ZONE } from "@/lib/requesteeTimeSlots";

/**
 * Where a case's payment stands, on the firm's dashboard: a badge beside the
 * case's name, so it's seen at a glance, and a box under the case with the
 * way to pay. Nothing until the case is scheduled (`dueAt` null), since
 * payment isn't asked for before then (lib/invoice.ts).
 */

export type CasePayment = {
  dueAt: Date | null;
  paid: boolean;
  /** A bank payment clearing, or a payment we're checking. */
  underway: "processing" | "review" | null;
  nowMs: number;
};

type PaymentState = "paid" | "processing" | "review" | "overdue" | "due";

function paymentState({ dueAt, paid, underway, nowMs }: CasePayment): PaymentState | null {
  if (paid) return "paid";
  if (!dueAt) return null;
  if (underway) return underway;
  return nowMs >= dueAt.getTime() ? "overdue" : "due";
}

const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: SLOT_TIME_ZONE, month: "short", day: "numeric" });

/** Beside the case's name. Says it in words, not only by color. */
export function CasePaymentBadge(payment: CasePayment) {
  const state = paymentState(payment);
  if (!state) return null;
  const [label, className] = {
    paid: ["Invoice paid", "border-green-300 bg-green-50 text-green-700"],
    processing: ["Payment processing", "border-blue-300 bg-blue-50 text-blue-700"],
    review: ["Payment received", "border-blue-300 bg-blue-50 text-blue-700"],
    overdue: ["Invoice overdue", "border-red-300 bg-red-50 text-red-700"],
    due: [`Invoice due ${shortDate.format(payment.dueAt!)}`, "border-amber-300 bg-amber-50 text-amber-800"],
  }[state];
  return (
    <Badge variant="outline" className={`whitespace-nowrap font-semibold ${className}`}>
      {label}
    </Badge>
  );
}

/** Under the case: the due date and Pay, or why there's nothing to pay. */
export default function CasePaymentPrompt({
  caseId,
  payOnline,
  ...payment
}: CasePayment & { caseId: string; payOnline: boolean }) {
  const state = paymentState(payment);
  if (!state) return null;
  const invoiceHref = `/invoice/${caseId}`;

  if (state === "paid") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-green-700">
        <span className="text-sm font-medium">Invoice paid. Thank you.</span>
        <Link href={invoiceHref} className="text-sm font-medium hover:underline">
          View invoice
        </Link>
      </div>
    );
  }

  if (state === "processing" || state === "review") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
        <span className="text-sm font-medium">
          {state === "processing"
            ? "Your bank payment is on its way. It usually clears in about 4 working days."
            : "We've received your payment and are checking it against the invoice."}
        </span>
        <Link href={invoiceHref} className="text-sm font-medium hover:underline">
          View invoice
        </Link>
      </div>
    );
  }

  const overdue = state === "overdue";
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
        overdue ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">
          {overdue ? `Payment was due ${formatDeadline(payment.dueAt!)}.` : `Payment is due by ${formatDeadline(payment.dueAt!)}.`}
        </span>
      </div>
      <Link href={invoiceHref} className={buttonVariants({ size: "sm" })}>
        {payOnline ? (
          <>
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Pay invoice
          </>
        ) : (
          "View invoice"
        )}
      </Link>
    </div>
  );
}
