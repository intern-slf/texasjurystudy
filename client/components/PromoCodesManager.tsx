"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePromoCode, setPromoCodeActive } from "@/lib/actions/adminPromoCode";
import { formatDateKey } from "@/lib/requesteeTimeSlots";
import {
  MAX_PERCENT_OFF,
  MIN_PERCENT_OFF,
  PROMO_CODE_STATUS_LABEL,
  type PromoCodeInput,
  type PromoCodeRow,
  type PromoCodeStatus,
} from "@/lib/promoCode";

export type PromoCodeListItem = PromoCodeRow & {
  firmIds: string[];
  /** Cases holding the code now. */
  uses: number;
  status: PromoCodeStatus;
};

export type FirmOption = { id: string; label: string; email: string | null };

const STATUS_CLASSES: Record<PromoCodeStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  off: "bg-slate-100 text-slate-600 border-slate-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
  used_up: "bg-blue-50 text-blue-700 border-blue-200",
};

const WITH_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** Create, edit, and switch codes on and off. */
export default function PromoCodesManager({ codes, firms }: { codes: PromoCodeListItem[]; firms: FirmOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // "new", a code's id, or null when no form is open.
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);

  function toggle(code: PromoCodeListItem) {
    setRowError(null);
    startTransition(async () => {
      try {
        const result = await setPromoCodeActive(code.id, !code.active);
        if (!result.ok) setRowError({ id: code.id, text: result.error });
        else router.refresh();
      } catch (err) {
        console.error("[PromoCodesManager] switch failed:", err);
        setRowError({ id: code.id, text: "Something went wrong. Refresh the page and try again." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <PromoCodeForm code={null} firms={firms} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New promo code
        </Button>
      )}

      {codes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-10 text-center text-sm text-muted-foreground">
          No promo codes yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {codes.map((code) =>
            editing === code.id ? (
              <li key={code.id}>
                <PromoCodeForm code={code} firms={firms} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={code.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="font-mono text-base font-semibold tracking-wide">{code.code}</span>
                      <span className="text-sm font-semibold text-emerald-700">{code.percent_off}% off</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[code.status]}`}>
                        {PROMO_CODE_STATUS_LABEL[code.status]}
                      </span>
                    </div>
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                      <div>
                        <dt className="inline text-slate-400">Used on </dt>
                        <dd className="inline">
                          {code.uses}
                          {code.max_uses != null ? ` of ${code.max_uses}` : ""} {(code.max_uses ?? code.uses) === 1 ? "case" : "cases"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-400">Last day </dt>
                        <dd className="inline">{code.expires_on ? formatDateKey(code.expires_on, WITH_YEAR) : "none"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="inline text-slate-400">For </dt>
                        <dd className="inline">
                          {code.firms_only
                            ? code.firmIds.map((id) => firmById.get(id)?.label ?? "a firm no longer listed").join(", ") ||
                              "no firms"
                            : "every firm"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(code.id)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => toggle(code)}
                      className={code.active ? "text-red-600 hover:bg-red-50 hover:text-red-700" : ""}
                    >
                      {code.active ? "Switch off" : "Switch on"}
                    </Button>
                  </div>
                </div>
                {rowError?.id === code.id && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {rowError.text}
                  </p>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        A case keeps the percentage it got, whatever happens to the code later. A use is a case holding the code
        now: removing it from an unpaid case frees the use.
      </p>
    </div>
  );
}

/* =========================
   THE FORM
========================= */

function PromoCodeForm({
  code,
  firms,
  onDone,
}: {
  /** Null for a new code. */
  code: PromoCodeListItem | null;
  firms: FirmOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(code?.code ?? "");
  const [percent, setPercent] = useState(code ? String(code.percent_off) : "");
  const [expiresOn, setExpiresOn] = useState(code?.expires_on ?? "");
  const [maxUses, setMaxUses] = useState(code?.max_uses != null ? String(code.max_uses) : "");
  const [firmsOnly, setFirmsOnly] = useState(code?.firms_only ?? false);
  const [picked, setPicked] = useState<Set<string>>(new Set(code?.firmIds ?? []));
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? firms.filter((f) => f.label.toLowerCase().includes(needle) || (f.email ?? "").toLowerCase().includes(needle))
    : firms;

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: PromoCodeInput = {
      code: text,
      percentOff: Number(percent),
      expiresOn: expiresOn || null,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      firmsOnly,
      firmIds: Array.from(picked),
    };
    startTransition(async () => {
      try {
        const result = await savePromoCode(code?.id ?? null, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone();
        router.refresh();
      } catch (err) {
        console.error("[PromoCodeForm] save failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm sm:p-5">
      <h3 className="text-base font-semibold">{code ? `Edit ${code.code}` : "New promo code"}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="promo-code" className="text-sm font-medium">
            Code
          </label>
          <Input
            id="promo-code"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="FALL10"
            autoComplete="off"
            maxLength={32}
            required
            className="bg-white font-mono uppercase placeholder:normal-case"
          />
          <p className="text-xs text-muted-foreground">3 to 32 letters, digits, - or _. Firms can type it in any case.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="promo-percent" className="text-sm font-medium">
            Discount
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="promo-percent"
              type="number"
              inputMode="numeric"
              min={MIN_PERCENT_OFF}
              max={MAX_PERCENT_OFF}
              step={1}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="10"
              required
              className="w-28 bg-white"
            />
            <span className="text-sm text-slate-600">% off the case total</span>
          </div>
          {code && (
            <p className="text-xs text-muted-foreground">Cases that already have this code keep their percentage.</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="promo-expires" className="text-sm font-medium">
            Last day <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="promo-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="w-full bg-white sm:w-48"
          />
          <p className="text-xs text-muted-foreground">It works through the end of this day, Central Time.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="promo-max-uses" className="text-sm font-medium">
            Max uses <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="promo-max-uses"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="No limit"
            className="w-28 bg-white"
          />
          <p className="text-xs text-muted-foreground">How many cases can hold it at once.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who can use it</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="promo-firms" checked={!firmsOnly} onChange={() => setFirmsOnly(false)} />
            Every firm
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="promo-firms" checked={firmsOnly} onChange={() => setFirmsOnly(true)} />
            Only the firms I pick
          </label>
        </div>

        {firmsOnly && (
          <div className="space-y-2 rounded-lg border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input
                aria-label="Search firms"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                className="h-8 max-w-xs"
              />
              <span className="text-xs text-muted-foreground">{picked.size} picked</span>
            </div>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {shown.length === 0 ? (
                <li className="py-2 text-sm text-muted-foreground">No firms match.</li>
              ) : (
                shown.map((firm) => (
                  <li key={firm.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={picked.has(firm.id)} onChange={() => togglePicked(firm.id)} />
                      <span className="truncate">{firm.label}</span>
                      {firm.email && firm.email !== firm.label && (
                        <span className="truncate text-xs text-muted-foreground">{firm.email}</span>
                      )}
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : code ? "Save changes" : "Create code"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
