"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPromoCode } from "@/lib/actions/requesteePromoCode";

export type CheckedPromoCode = { code: string; percentOff: number };

/**
 * The promo code box on the new-case form. Checks the code before the case
 * exists, so the receipt above can show the discount; nothing is saved or held
 * until the case is, when the form applies it (applyPromoCode checks it again).
 */
export default function PromoCodeField({
  value,
  onChange,
  disabled = false,
}: {
  value: CheckedPromoCode | null;
  onChange: (value: CheckedPromoCode | null) => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await checkPromoCode(code);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onChange({ code: result.code, percentOff: result.percentOff });
        setCode("");
      } catch (err) {
        console.error("[PromoCodeField] check failed:", err);
        setError("Couldn't check that promo code. Try again.");
      }
    });
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
          Promo code {value.code}: {value.percentOff}% off
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          Remove
        </Button>
      </div>
    );
  }

  // A div, not a form: the new-case page isn't one form, but Enter should still apply the code.
  return (
    <div className="space-y-1">
      <label htmlFor="new-case-promo" className="text-xs font-medium text-slate-600">
        Have a promo code?
      </label>
      <div className="flex gap-2">
        <Input
          id="new-case-promo"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply(e);
          }}
          placeholder="Enter code"
          autoComplete="off"
          maxLength={32}
          disabled={pending || disabled}
          className="h-8 bg-white uppercase placeholder:normal-case"
        />
        <Button type="button" size="sm" variant="outline" disabled={pending || disabled || !code.trim()} onClick={apply}>
          {pending ? "Checking…" : "Apply"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
