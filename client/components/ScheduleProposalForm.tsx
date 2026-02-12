"use client";

import { useTransition } from "react";
import { AdminActionButton } from "@/components/AdminActionButton";
import { proposeSchedule } from "@/app/dashboard/Admin/actions";

interface ScheduleProposalFormProps {
  caseId: string;
}

export default function ScheduleProposalForm({ caseId }: ScheduleProposalFormProps) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    const rawDate = formData.get("scheduled_at") as string;
    if (!rawDate) return;

    // Convert local datetime-local string to ISO string (UTC)
    // new Date(rawDate) uses the browser's timezone because rawDate has no offset
    const date = new Date(rawDate);
    const isoDate = date.toISOString();

    startTransition(async () => {
      try {
        await proposeSchedule(caseId, isoDate);
        // Success
      } catch (error) {
        console.error("Failed to propose schedule", error);
        alert("Failed to propose schedule");
      }
    });
  };

  return (
    <form action={handleSubmit} className="flex gap-2 items-center">
      <input
        type="datetime-local"
        name="scheduled_at"
        required
        className="h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <AdminActionButton
        label={isPending ? "Sending..." : "Send"}
        activeColor="bg-purple-600"
        hoverColor="hover:bg-purple-700"
      />
    </form>
  );
}
