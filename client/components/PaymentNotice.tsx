"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const TONE = {
  success: "bg-green-50 text-green-800 ring-green-600/20",
  info: "bg-blue-50 text-blue-800 ring-blue-600/20",
  neutral: "bg-slate-50 text-slate-700 ring-slate-600/20",
} as const;

/** How often, and how many times, to check whether a just-made payment has been recorded. */
const POLL_MS = 3000;
const POLL_TIMES = 10;

/**
 * Where an online payment stands, on the invoice page. Always rendered, so its
 * live region is in the page before its text changes: a region that appears
 * with its text already in it isn't announced reliably.
 *
 * `focusOnLoad`: the firm just came back from Stripe, so focus moves here and
 * a screen reader reads where the payment stands, rather than starting at the
 * top of the page. `waitForPaid`: the payment was made but the webhook hasn't
 * recorded it yet, so the page refreshes itself for a little while; when it
 * flips to paid, the changed text is announced.
 */
export default function PaymentNotice({
  notice,
  focusOnLoad,
  waitForPaid,
}: {
  notice: { tone: keyof typeof TONE; text: string } | null;
  focusOnLoad: boolean;
  waitForPaid: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (focusOnLoad) ref.current?.focus();
    // Only on arrival: a refresh below must not pull focus back here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!waitForPaid) return;
    let times = 0;
    const timer = setInterval(() => {
      if (++times > POLL_TIMES) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waitForPaid, router]);

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="outline-none print:hidden">
      {notice && <p className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${TONE[notice.tone]}`}>{notice.text}</p>}
    </div>
  );
}
