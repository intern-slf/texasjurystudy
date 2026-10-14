"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeDeliveryMode } from "@/lib/case/deliveryMode";
import { revalidatePath } from "next/cache";

// A firm's own writes to its case row, from the forms on its dashboard
// (app/dashboard/requestee/page.tsx). Each one acts only on a case in the state
// its form is shown for, checked in the same UPDATE, so a stale tab or a
// hand-made request can't use it once an admin has moved the case on. The
// database separately refuses the changes only staff may make
// (cases_protect_admin_fields, supabase/migrations/20261005_protect_case_admin_fields.sql).

const TIMEFRAME_TO_DAYS: Record<string, number> = {
  "Within a Week": 7,
  "Within 2 Weeks": 14,
  "Within a Month": 30,
  "Within 3 Months": 90,
};

/**
 * "Edit Case Details" on the Requested tab: only while the case is current and
 * not yet approved (admin_status 'all', or 'rejected' before Request Again).
 * Once approved, hours, format, county and the rest are what the admin approved
 * and what the receipt is priced from.
 */
export async function updateCase(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const focusGroupType = formData.get("focus_group_type") as string;
  const caseType = formData.get("case_type") as string;
  const hoursRequested = formData.get("hours_requested") as string;
  const deliveryMode = formData.get("delivery_mode") as string | null;
  const county = formData.get("county") as string;
  const participantsFromCounty = formData.get("participants_from_county") as string;
  const sessionCompletionTimeframe = formData.get("session_completion_timeframe") as string;
  const preferredDay = formData.get("preferred_day") as string;

  const supabase = await createClient();
  const { data: { user: activeUser } } = await supabase.auth.getUser();
  if (!activeUser) return;

  const updatePayload: Record<string, unknown> = {
    title,
    description,
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    focus_group_type: focusGroupType || null,
    case_type: caseType || null,
    hours_requested: hoursRequested ? Number(hoursRequested) : null,
    county: county || null,
    participants_from_county: participantsFromCounty || null,
    session_completion_timeframe: sessionCompletionTimeframe || null,
    preferred_day: preferredDay || null,
  };

  // The format is only writable while the case is unscheduled — flipping it
  // under a booked session would move it between price and payout regimes. The
  // form omits the field once the case is in a session; this re-checks, so a
  // replayed or hand-crafted POST is dropped here rather than surfacing the
  // database trigger's rejection as a bare 500.
  if (deliveryMode) {
    const { data: scheduled } = await supabase
      .from("session_cases")
      .select("id")
      .eq("case_id", caseId)
      .limit(1);

    if (!scheduled?.length) {
      updatePayload.delivery_mode = normalizeDeliveryMode(deliveryMode);
    }
  }

  const days = TIMEFRAME_TO_DAYS[sessionCompletionTimeframe];
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    updatePayload.deadline_date = d.toISOString();
  } else if (sessionCompletionTimeframe === "") {
    updatePayload.deadline_date = null;
  }

  await supabase
    .from("cases")
    .update(updatePayload)
    .eq("id", caseId)
    .eq("user_id", activeUser.id)
    .eq("status", "current")
    .in("admin_status", ["all", "rejected"]);

  revalidatePath("/dashboard/requestee");
  revalidatePath(`/dashboard/requestee/${caseId}`);
}

/**
 * "Confirm Attendance" / "Decline" on the Approved tab. Shown while the admin's
 * proposed time awaits an answer: admin_scheduled_at is set and schedule_status
 * is 'pending', or null after a reschedule reset it.
 */
export async function respondToSchedule(formData: FormData) {
  const caseId = formData.get("caseId") as string;
  const response = formData.get("response");
  if (response !== "accepted" && response !== "rejected") return;

  const supabase = await createClient();
  const { data: { user: activeUser } } = await supabase.auth.getUser();

  if (!activeUser) return;

  const { data: caseData } = await supabase
    .from("cases")
    .select("admin_scheduled_at")
    .eq("id", caseId)
    .eq("user_id", activeUser.id)
    .not("admin_scheduled_at", "is", null)
    .or("schedule_status.is.null,schedule_status.eq.pending")
    .maybeSingle();

  if (!caseData) return;

  const updatePayload: Record<string, string | null> = { schedule_status: response };
  if (response === "accepted") {
    updatePayload.scheduled_at = caseData.admin_scheduled_at;
  }

  // The same state, and the same proposed time, again in the write, so a new
  // proposal that lands in between isn't answered with this reply.
  await supabase
    .from("cases")
    .update(updatePayload)
    .eq("id", caseId)
    .eq("user_id", activeUser.id)
    .eq("admin_scheduled_at", caseData.admin_scheduled_at)
    .or("schedule_status.is.null,schedule_status.eq.pending");

  revalidatePath("/dashboard/requestee");
}

/**
 * "Request Again" on a rejected case on the Requested tab: back into the admin's
 * queue, with the old reason cleared. Never on a case that isn't rejected, which
 * would pull an approved case out of the queue and off its session's notify list.
 */
export async function requestAgain(formData: FormData) {
  const caseId = formData.get("case_id") as string;
  const supabase = await createClient();
  const { data: { user: activeUser } } = await supabase.auth.getUser();
  if (!activeUser) return;

  await supabase
    .from("cases")
    .update({ admin_status: "all", rejection_reason: null })
    .eq("id", caseId)
    .eq("user_id", activeUser.id)
    .eq("status", "current")
    .eq("admin_status", "rejected");

  revalidatePath("/dashboard/requestee");
}
