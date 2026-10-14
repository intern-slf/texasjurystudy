"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { billableHours } from "@/lib/receipt-pricing";
import {
  SLOT_TIME_ZONE_LABEL,
  formatDateKey,
  formatSlotRange,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";
import { slotFitsHours } from "@/lib/slotBooking";

type Props = {
  /** Open slots, earliest first. */
  slots: TimeSlot[];
  /** Only slots at least this long are offered. Empty or 0 counts as 1 hour, as in pricing. */
  hoursRequested: number | null;
  value: string | null;
  /** Called with the picked slot, or null when the firm unpicks it. */
  onChange: (slotId: string | null) => void;
  disabled?: boolean;
};

/** The open time slots a firm can pick from, by day, in Central Time. */
export default function TimeSlotPicker({ slots, hoursRequested, value, onChange, disabled }: Props) {
  const byDate = useMemo(() => {
    const groups = new Map<string, TimeSlot[]>();
    for (const slot of slots) {
      if (!slotFitsHours(slot, hoursRequested)) continue;
      const dateKey = slotDateKey(slot.starts_at);
      groups.set(dateKey, [...(groups.get(dateKey) ?? []), slot]);
    }
    return Array.from(groups.entries());
  }, [slots, hoursRequested]);

  const contact = (
    <>
      email us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline-offset-2 hover:underline">
        {SUPPORT_EMAIL}
      </a>
    </>
  );

  if (!byDate.length) {
    const hours = billableHours(hoursRequested);
    return (
      <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        No open time fits {hours} hour{hours === 1 ? "" : "s"} right now. To arrange one, {contact}, or tell us your
        preferred timing below.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Available times"
        className="max-h-80 space-y-4 overflow-y-auto rounded-xl border bg-white p-3"
      >
        {byDate.map(([dateKey, daySlots]) => (
          <div key={dateKey}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {formatDateKey(dateKey, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const selected = value === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onChange(selected ? null : slot.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-all disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-input hover:border-primary/40"
                    )}
                  >
                    <span className="block font-medium">
                      {formatSlotRange(slot)} {SLOT_TIME_ZONE_LABEL}
                    </span>
                    {slot.note && <span className="block text-xs text-muted-foreground">{slot.note}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        None of these work? Email us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {SUPPORT_EMAIL}
        </a>{" "}
        and we&apos;ll find a time.
      </p>
    </div>
  );
}
