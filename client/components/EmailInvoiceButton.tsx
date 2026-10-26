"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailInvoice } from "@/lib/actions/adminInvoice";

const TONE = { success: "text-green-700", warning: "text-amber-700", error: "text-red-600" } as const;

/**
 * For admins: emails a case's invoice, with its PDF, to the firm it's billed to, after a
 * confirm, since it goes out to a client. On the invoice page, the case page
 * and the Requestees tab. `to` names the address in the confirm when the page
 * knows it; the action sends to the invoice's own and says which.
 */
export default function EmailInvoiceButton({ caseId, to }: { caseId: string; to?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);

  function send() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await emailInvoice(caseId);
        setMessage(
          !result.ok
            ? { tone: "error", text: result.error }
            : result.warning
              ? { tone: "warning", text: result.warning }
              : { tone: "success", text: `Sent to ${result.sentTo}, with the PDF attached.` }
        );
      } catch (err) {
        console.error("[EmailInvoiceButton] action failed:", err);
        setMessage({ tone: "error", text: "Something went wrong. Refresh the page and try again." });
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && (
        <p role="status" className={`text-sm ${TONE[message.tone]}`}>
          {message.text}
        </p>
      )}
      {confirming ? (
        <>
          <span className="text-sm text-muted-foreground">
            Email the invoice to {to ? <span className="font-medium text-foreground">{to}</span> : "the firm"}?
          </span>
          <Button type="button" size="sm" disabled={pending} onClick={send}>
            {pending ? "Sending…" : "Yes, send"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Email to firm
        </Button>
      )}
    </div>
  );
}
