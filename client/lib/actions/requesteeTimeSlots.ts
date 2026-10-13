"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  TIME_SLOTS_PATH,
  describeSlot,
  findOverlappingSlot,
  planTimeSlots,
  type NewTimeSlotsInput,
} from "@/lib/requesteeTimeSlots";

// Every export here is an admin action and starts with requireAdmin(): as server
// actions they can be called by anyone signed in, with any arguments. They write
// through the admin's own client, not the service role, so the table's
// admin-only RLS policy checks each write a second time.
//
// Problems the admin can fix come back as { ok: false, error } rather than a
// throw, because Next replaces a thrown message with a generic one in
// production and the admin needs to know which slot is in the way.

type Failure = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* =========================
   ADD TIME SLOTS
========================= */

export async function createRequesteeTimeSlots(
  input: NewTimeSlotsInput
): Promise<{ ok: true; created: number } | Failure> {
  const adminId = await requireAdmin();

  const plan = planTimeSlots(input, Date.now());
  if (!plan.ok) return plan;

  const supabase = await createClient();
  const first = plan.slots[0];
  const last = plan.slots[plan.slots.length - 1];

  // Only slots between the first new start and the last new end can overlap.
  const { data: existing, error: readError } = await supabase
    .from("requestee_time_slots")
    .select("id, starts_at, ends_at")
    .lt("starts_at", last.ends_at)
    .gt("ends_at", first.starts_at);

  if (readError) {
    console.error("[createRequesteeTimeSlots] overlap check failed:", readError);
    return { ok: false, error: "Couldn't check the calendar for overlapping slots. Try again." };
  }

  const clash = findOverlappingSlot(plan.slots, existing ?? []);
  if (clash) {
    return {
      ok: false,
      error: `This overlaps the slot on ${describeSlot(clash)}. Pick another time, or delete that slot first.`,
    };
  }

  const { error } = await supabase
    .from("requestee_time_slots")
    .insert(plan.slots.map((slot) => ({ ...slot, created_by: adminId })));

  if (error) {
    console.error("[createRequesteeTimeSlots] insert failed:", error);
    return { ok: false, error: "Couldn't save the time slots. Try again." };
  }

  revalidatePath(TIME_SLOTS_PATH);
  return { ok: true, created: plan.slots.length };
}

/* =========================
   DELETE A TIME SLOT
========================= */

export async function deleteRequesteeTimeSlot(slotId: string): Promise<{ ok: true } | Failure> {
  await requireAdmin();

  if (typeof slotId !== "string" || !UUID_RE.test(slotId)) {
    return { ok: false, error: "That time slot doesn't exist." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requestee_time_slots")
    .delete()
    .eq("id", slotId)
    .select("id");

  if (error) {
    console.error("[deleteRequesteeTimeSlot] delete failed:", error);
    return { ok: false, error: "Couldn't delete the time slot. Try again." };
  }

  // No error and no row: the slot was already gone, or RLS refused the delete.
  if (!data?.length) {
    return { ok: false, error: "Nothing was deleted. Refresh the page: the slot may already be gone." };
  }

  revalidatePath(TIME_SLOTS_PATH);
  return { ok: true };
}
