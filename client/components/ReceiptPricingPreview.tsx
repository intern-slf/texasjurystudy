"use client";

import { useState } from "react";
import { CaseFilters } from "@/lib/filter-utils";
import {
  calculateReceiptPrice,
  formatCents,
} from "@/lib/receipt-pricing";
import { deliveryModeLabel, isOffline } from "@/lib/case/deliveryMode";

export default function ReceiptPricingPreview({
  filters,
  hoursRequested,
  /** Omitted means online — the historical behaviour and the column default. */
  deliveryMode,
}: {
  filters: CaseFilters | null | undefined;
  hoursRequested?: number | null;
  deliveryMode?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = calculateReceiptPrice(filters, hoursRequested, deliveryMode);
  const offline = isOffline(breakdown.deliveryMode);

  return (
    <div
      className={`rounded-lg border p-4 ${
        offline ? "border-green-200 bg-green-50/50" : "border-blue-200 bg-blue-50/50"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-700">
              Receipt Value
            </p>
            {/* Named on the summary line, not only in the expanded table: the
                two rates differ by more than 10×, so which one produced this
                number has to be visible without a click. */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                offline
                  ? "text-green-700 bg-green-100 border border-green-200"
                  : "text-blue-700 bg-blue-100 border border-blue-200"
              }`}
            >
              {deliveryModeLabel(breakdown.deliveryMode)}
            </span>
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {formatCents(breakdown.totalCostCents)}
          </p>
        </div>
        <svg
          className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {expanded && (
        <div className={`mt-3 border-t pt-3 ${offline ? "border-green-200" : "border-blue-200"}`}>
          <table className="w-full text-sm">
            <tbody>
              <tr className={`border-b ${offline ? "border-green-100" : "border-blue-100"}`}>
                <td className="py-1.5 text-slate-600">
                  Base ({breakdown.hours} {breakdown.hours === 1 ? "hour" : "hours"}
                  {" × "}
                  {formatCents(breakdown.baseRatePerHourCents)}/hr)
                </td>
                <td className="py-1.5 text-right text-slate-700">
                  {formatCents(breakdown.baseCostCents)}
                </td>
              </tr>
              {breakdown.filterItems.map((item) => (
                <tr key={item.label} className={`border-b ${offline ? "border-green-100" : "border-blue-100"}`}>
                  <td className="py-1.5 text-slate-600">
                    {item.label} filter
                  </td>
                  <td className="py-1.5 text-right text-slate-700">
                    {formatCents(item.costCents)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-2 text-slate-700">Total</td>
                <td className="pt-2 text-right text-slate-900">
                  {formatCents(breakdown.totalCostCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
