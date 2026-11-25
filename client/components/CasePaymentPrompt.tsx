import Link from "next/link";
import { CreditCard, Receipt } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDeadline } from "@/lib/slotBooking";

/**
 * On the firm's dashboard, under a case: where payment stands, with the way to
 * pay. Nothing until the case is scheduled (`dueAt` null), since payment isn't
 * asked for before then (lib/invoice.ts).
 */
export default function CasePaymentPrompt({
  caseId,
  dueAt,
  paid,
  underway,
  payOnline,
  nowMs,
}: {
  caseId: string;
  dueAt: Date | null;
  paid: boolean;
  /** A bank payment clearing, or a payment we're checking. */
  underway: "processing" | "review" | null;
  payOnline: boolean;
  nowMs: number;
}) {
  const invoiceHref = `/invoice/${caseId}`;

  if (paid) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-green-700">
        <span className="text-sm font-medium">Invoice paid. Thank you.</span>
        <Link href={invoiceHref} className="text-sm font-medium hover:underline">
          View invoice
        </Link>
      </div>
    );
  }
  if (!dueAt) return null;

  if (underway) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
        <span className="text-sm font-medium">
          {underway === "processing"
            ? "Your bank payment is on its way. It usually clears in about 4 working days."
            : "We've received your payment and are checking it against the invoice."}
        </span>
        <Link href={invoiceHref} className="text-sm font-medium hover:underline">
          View invoice
        </Link>
      </div>
    );
  }

  const overdue = nowMs >= dueAt.getTime();
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
        overdue ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">
          {overdue ? `Payment was due ${formatDeadline(dueAt)}.` : `Payment is due by ${formatDeadline(dueAt)}.`}
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
