"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyPromoCode, removePromoCode } from "@/lib/actions/requesteePromoCode";
import { adminApplyPromoCode, adminRemoveCaseDiscount, adminSetCaseDiscount } from "@/lib/actions/adminPromoCode";
import { MAX_PERCENT_OFF, MIN_PERCENT_OFF, type CaseDiscount } from "@/lib/promoCode";
import { formatCentralDate } from "@/lib/timezone";

type Props = {
  caseId: string;
  /** firm: the case's own firm, on its case page. admin: any case, with an own-percentage option too. */
  audience: "firm" | "admin";
  discount: CaseDiscount | null;
  /** Marked paid: the discount can't change. */
  paid: boolean;
  /** The discount couldn't be read, so nothing is offered. */
  unavailable?: boolean;
};

type ActionResult = { ok: true } | { ok: false; error: string };

/** Who put the discount on, for the admin: "Code FALL10, added by the firm on Oct 27, 2026". */
function describeForAdmin(discount: CaseDiscount): string {
  const what = discount.code ? `Code ${discount.code}` : "Our own percentage";
  const who = discount.appliedByAdmin ? "an admin" : "the firm";
  const when = formatCentralDate(discount.appliedAt);
  return `${what}, added by ${who}${when ? ` on ${when}` : ""}.`;
}

/**
 * The promo code box under a case's receipt. A firm types a code; an admin
 * types a code or a percentage of our own. Either can replace or remove the
 * discount until the case is paid. The receipt above shows what it takes off.
 */
export default function CaseDiscountControl({ caseId, audience, discount, paid, unavailable = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const admin = audience === "admin";

  if (unavailable) {
    return <p className="text-sm text-amber-700">Couldn&apos;t load the discount. Refresh the page.</p>;
  }

  if (paid) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Tag className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        {discount
          ? `${discount.percentOff}% discount applied. This case is paid, so it can't change.`
          : "This case is paid, so a promo code can't be added."}
      </p>
    );
  }

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        after?.();
        router.refresh();
      } catch (err) {
        console.error("[CaseDiscountControl] action failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  function applyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    run(() => (admin ? adminApplyPromoCode(caseId, code) : applyPromoCode(caseId, code)), () => setCode(""));
  }

  function applyPercent(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(percent);
    if (!Number.isInteger(value) || value < MIN_PERCENT_OFF || value > MAX_PERCENT_OFF) {
      setError(`Enter a whole number from ${MIN_PERCENT_OFF} to ${MAX_PERCENT_OFF}.`);
      return;
    }
    run(() => adminSetCaseDiscount(caseId, value), () => setPercent(""));
  }

  function remove() {
    run(() => (admin ? adminRemoveCaseDiscount(caseId) : removePromoCode(caseId)));
  }

  return (
    <div className="space-y-3">
      {discount && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
              {discount.percentOff}% discount applied
            </p>
            {admin && <p className="mt-0.5 text-xs text-emerald-700">{describeForAdmin(discount)}</p>}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Remove
          </Button>
        </div>
      )}

      <form onSubmit={applyCode} className="space-y-1">
        <label htmlFor={`promo-${caseId}`} className="text-xs font-medium text-slate-600">
          {discount ? "Replace with a promo code" : admin ? "Apply a promo code" : "Have a promo code?"}
        </label>
        <div className="flex gap-2">
          <Input
            id={`promo-${caseId}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code"
            autoComplete="off"
            maxLength={32}
            disabled={pending}
            className="h-8 bg-white uppercase placeholder:normal-case"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !code.trim()}>
            {pending ? "Saving…" : "Apply"}
          </Button>
        </div>
      </form>

      {admin && (
        <form onSubmit={applyPercent} className="space-y-1">
          <label htmlFor={`percent-${caseId}`} className="text-xs font-medium text-slate-600">
            Or a discount of our own, without a code
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={`percent-${caseId}`}
              type="number"
              inputMode="numeric"
              min={MIN_PERCENT_OFF}
              max={MAX_PERCENT_OFF}
              step={1}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="10"
              disabled={pending}
              className="h-8 w-24 bg-white"
            />
            <span className="text-sm text-slate-600">% off</span>
            <Button type="submit" size="sm" variant="outline" disabled={pending || !percent}>
              {pending ? "Saving…" : "Apply"}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
