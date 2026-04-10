"use client";

import { useState } from "react";
import { CaseFilters } from "@/lib/filter-utils";
import {
  calculateReceiptPrice,
  formatCents,
} from "@/lib/receipt-pricing";

export default function ReceiptPricingPreview({
  filters,
  hoursRequested,
}: {
  filters: CaseFilters | null | undefined;
  hoursRequested?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = calculateReceiptPrice(filters, hoursRequested);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-slate-700">
            Receipt Value
          </p>
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
        <div className="mt-3 border-t border-blue-200 pt-3">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-blue-100">
                <td className="py-1.5 text-slate-600">
                  Base ({breakdown.hours} {breakdown.hours === 1 ? "hour" : "hours"})
                </td>
                <td className="py-1.5 text-right text-slate-700">
                  {formatCents(breakdown.baseCostCents)}
                </td>
              </tr>
              {breakdown.filterItems.map((item) => (
                <tr key={item.label} className="border-b border-blue-100">
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
