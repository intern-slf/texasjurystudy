"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import { cancelMyTimeSlot, chooseTimeSlot } from "@/lib/actions/requesteeSlotBooking";
import type { TimeSlot } from "@/lib/requesteeTimeSlots";

type Props = {
  caseId: string;
  hasSlot: boolean;
  paid: boolean;
  openSlots: TimeSlot[];
  hoursRequested: number | null;
};

/** The firm's controls on its case page: hold a time, switch it, or give it up, until the case is approved. */
export default function CaseTimeSlotControls({ caseId, hasSlot, paid, openSlots, hoursRequested }: Props) {
  const router = useRouter();
  const [picking, setPicking] = useState(!hasSlot);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSlotId(null);
        setConfirmingCancel(false);
        setPicking(false);
        router.refresh();
      } catch (err) {
        console.error("[CaseTimeSlotControls] action failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {hasSlot && !picking && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setPicking(true)}>
            Change time
          </Button>
          {!paid &&
            (confirmingCancel ? (
              <>
                <span className="text-xs text-muted-foreground">Give up this time?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => cancelMyTimeSlot(caseId))}
                >
                  {pending ? "Cancelling…" : "Yes, cancel it"}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmingCancel(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmingCancel(true)}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Cancel time
              </Button>
            ))}
        </div>
      )}

      {picking && (
        <div className="space-y-3">
          <TimeSlotPicker
            slots={openSlots}
            hoursRequested={hoursRequested}
            value={slotId}
            onChange={setSlotId}
            disabled={pending}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || !slotId}
              onClick={() => slotId && run(() => chooseTimeSlot(caseId, slotId))}
            >
              {pending ? "Holding…" : hasSlot ? "Switch to this time" : "Hold this time"}
            </Button>
            {hasSlot && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setPicking(false)}>
                Keep my current time
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
