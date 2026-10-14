"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTimeSlotsDialog from "@/components/AddTimeSlotsDialog";
import { TIME_SLOTS_PATH, addDays, slotDateKey } from "@/lib/requesteeTimeSlots";

/** "Add Time Slots" on the Requestees page: opens the form, then shows the new slots on the calendar. */
export default function AddTimeSlotsButton() {
  const router = useRouter();
  const [openOn, setOpenOn] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpenOn(addDays(slotDateKey(Date.now()), 1))}>
        <CalendarPlus />
        Add Time Slots
      </Button>

      {openOn && (
        <AddTimeSlotsDialog
          initialDate={openOn}
          onClose={() => setOpenOn(null)}
          onCreated={(_created, firstDate) => {
            setOpenOn(null);
            router.push(`${TIME_SLOTS_PATH}?month=${firstDate.slice(0, 7)}`);
          }}
        />
      )}
    </>
  );
}
