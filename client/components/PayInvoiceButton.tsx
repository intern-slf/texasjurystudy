"use client";

import { useState, useTransition } from "react";
import { preconnect } from "react-dom";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startInvoicePayment } from "@/lib/actions/requesteeInvoicePayment";

const CHECKOUT_ORIGIN = "https://checkout.stripe.com";

/**
 * For the firm: pays the invoice online. Opens a Stripe Checkout session
 * (card or bank transfer) and sends the browser there; Stripe sends it back
 * to the invoice page. On the invoice page only, so the firm sees what it's
 * paying for first.
 *
 * While it works the button stays focusable (aria-disabled, not disabled, so
 * keyboard and screen-reader users don't lose their place) and ignores further
 * clicks. The error line is a live region that's always in the page, so a
 * message put into it is announced. Pointing at or focusing the button opens a
 * connection to Stripe early, so the hand-off is quicker.
 */
export default function PayInvoiceButton({
  caseId,
  amountLabel,
  placement = "toolbar",
}: {
  caseId: string;
  amountLabel: string;
  /** toolbar: small, at the top right. footer: larger, centered under the invoice. */
  placement?: "toolbar" | "footer";
}) {
  const footer = placement === "footer";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Stays set once the browser is on its way to Stripe, so a second click can't open another session.
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;

  function warmUp() {
    preconnect(CHECKOUT_ORIGIN);
  }

  function pay() {
    if (busy) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await startInvoicePayment(caseId);
        if (result.ok) {
          setLeaving(true);
          window.location.assign(result.url);
        } else {
          setError(result.error);
        }
      } catch (err) {
        console.error("[PayInvoiceButton] action failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  return (
    <div className={footer ? "flex flex-col-reverse items-center gap-2" : "flex flex-wrap items-center justify-end gap-2"}>
      <p role="status" aria-live="polite" className="text-sm text-red-600">
        {error}
      </p>
      <Button
        type="button"
        size={footer ? "lg" : "sm"}
        aria-disabled={busy}
        aria-busy={busy}
        className="aria-disabled:cursor-progress aria-disabled:opacity-70"
        onClick={pay}
        onPointerEnter={warmUp}
        onFocus={warmUp}
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        {busy ? "Opening secure checkout…" : `Pay ${amountLabel} online`}
      </Button>
    </div>
  );
}
