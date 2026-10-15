"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRequestee } from "@/lib/requireRequestee";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { billableHours } from "@/lib/receipt-pricing";
import { TIME_SLOTS_PATH, describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";
import {
  earliestBookableStart,
  firmLabel,
  formatDeadline,
  isSlotFullError,
  paymentDueAt,
  slotFitsHours,
  slotMinutes,
} from "@/lib/slotBooking";
import { bookedMinutesBySlot, getBookingsForCases, getOpenSlots, slotsClosedToFirms } from "@/lib/slotBookingData";
import { formatMinutes } from "@/lib/case/paidTime";
import { sendSlotHeldEmail, sendSlotTeamNotice } from "@/lib/slotBookingEmails";

// A law firm's own booking actions. Every export starts with requireRequestee():
// as server actions they can be called by anyone signed in, with any arguments.
//
// Firms have no access to requestee_slot_bookings, so these read and write it with
// the service role, and each one first checks that the case is the caller's own and
// that the firm may still change its time: the case is under review (admin_status
// 'all'), current, not archived, and online. Once a case is approved, the firm emails
// us instead. A case that isn't the caller's gets the same answer as one that
// doesn't exist.
//
// Problems the firm can act on come back as { ok: false, error }, because Next hides
// a thrown message in production.

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
const CHANGED = "Your booking changed in another window. Refresh the page.";
const CONTACT = `email us at ${SUPPORT_EMAIL}`;

type OwnCase = {
  id: string;
  title: string;
  admin_status: string | null;
  status: string | null;
  deleted_at: string | null;
  delivery_mode: string | null;
  hours_requested: number | null;
};

async function loadOwnCase(caseId: string, userId: string): Promise<OwnCase | null> {
  const { data } = await supabaseAdmin
    .from("cases")
    .select("id, title, user_id, requestee_id, admin_status, status, deleted_at, delivery_mode, hours_requested")
    .eq("id", caseId)
    .maybeSingle();
  if (!data || (data.user_id !== userId && data.requestee_id !== userId)) return null;
  return data as OwnCase;
}

/** Why the firm can't book, change or cancel this case's time now, or null if it can. */
function blocker(theCase: OwnCase): string | null {
  if (theCase.delivery_mode === "offline") {
    return `Time slots are for online focus groups. For an in-person focus group, ${CONTACT} to arrange a time.`;
  }
  if (theCase.admin_status === "approved" || theCase.admin_status === "submitted") {
    return `Your case has been approved, so to change its time, ${CONTACT}.`;
  }
  if (theCase.admin_status !== "all" || theCase.status !== "current" || theCase.deleted_at) {
    return `This case can't hold a time right now. To arrange one, ${CONTACT}.`;
  }
  return null;
}

async function firmName(userId: string, email: string | null): Promise<string> {
  const { data } = await supabaseAdmin
    .from("confidentiality_agreements_requestee")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  return firmLabel(data ? `${data.first_name ?? ""} ${data.last_name ?? ""}` : null, email);
}

function revalidateBooking(caseId: string) {
  revalidatePath("/dashboard/requestee");
  revalidatePath(`/dashboard/requestee/${caseId}`);
  revalidatePath(TIME_SLOTS_PATH);
  revalidatePath("/dashboard/Admin");
  revalidatePath(`/dashboard/Admin/${caseId}`);
}

/* =========================
   OPEN TIMES
   Only the slot's own fields, never anything about who booked the others.
========================= */

export async function listOpenTimeSlots(): Promise<{ ok: true; slots: TimeSlot[] } | Failure> {
  await requireRequestee();
  try {
    const now = Date.now();
    const slots = await getOpenSlots(
      earliestBookableStart(now).toISOString(),
      new Date(now + SIX_MONTHS_MS).toISOString()
    );
    return { ok: true, slots };
  } catch (err) {
    console.error("[listOpenTimeSlots] read failed:", err);
    return fail("Couldn't load the available times. Refresh the page to try again.");
  }
}

/* =========================
   BOOK, OR SWITCH TO, A TIME
   A first booking starts the payment clock. Switching, or booking again after
   cancelling, keeps the clock and any payment: payment belongs to the case.
========================= */

export async function chooseTimeSlot(
  caseId: string,
  slotId: string
): Promise<{ ok: true; slot: TimeSlot; paid: boolean; dueAt: string | null } | Failure> {
  const userId = await requireRequestee();
  if (!isUuid(caseId) || !isUuid(slotId)) return fail("That case or time doesn't exist.");

  const theCase = await loadOwnCase(caseId, userId);
  if (!theCase) return fail("That case doesn't exist.");
  const blocked = blocker(theCase);
  if (blocked) return fail(blocked);

  const { data: slotRow } = await supabaseAdmin
    .from("requestee_time_slots")
    .select("id, starts_at, ends_at, note")
    .eq("id", slotId)
    .maybeSingle();
  const slot = slotRow as TimeSlot | null;
  if (!slot) return fail("That time is no longer available. Pick another one.");

  const now = Date.now();
  // Other firms' cases can share the slot, so what fits is what they've left of
  // it (not counting this case, if it's already there). The database checks the
  // same when the booking is written, so two firms at once can't both get the
  // last hours.
  const booked = (await bookedMinutesBySlot([slotId], caseId)).get(slotId) ?? 0;
  const minutesLeft = Math.max(slotMinutes(slot) - booked, 0);
  if (!slotFitsHours({ ...slot, minutes_left: minutesLeft }, theCase.hours_requested)) {
    const hours = billableHours(theCase.hours_requested);
    const needs = `${hours} hour${hours === 1 ? "" : "s"}`;
    return fail(
      !booked
        ? `That time is shorter than the ${needs} your case needs. Pick a longer one.`
        : minutesLeft
          ? `That time has only ${formatMinutes(minutesLeft)} left, and your case needs ${needs}. Pick another one.`
          : "That time is fully booked. Pick another one."
    );
  }
  if (Date.parse(slot.starts_at) < earliestBookableStart(now).getTime()) {
    return fail("That time is too soon to book now. Pick a later one.");
  }

  const existing = (await getBookingsForCases([caseId])).get(caseId);
  const paid = !!existing?.paid_at;
  const heldSince = existing?.held_since ?? new Date(now).toISOString();
  const due = paid ? null : paymentDueAt(heldSince).toISOString();
  if (existing?.slot_id === slotId) return { ok: true, slot, paid, dueAt: due };

  // Its session's participants are invited, so the panel is chosen for the
  // cases already in it: the leftover hours aren't sold any more.
  if ((await slotsClosedToFirms([slotId])).has(slotId)) {
    return fail(`That time is no longer open for booking. To join it, ${CONTACT}.`);
  }

  const nowIso = new Date(now).toISOString();
  let result;
  if (existing) {
    // Only if the booking is still what we just read.
    const update = supabaseAdmin
      .from("requestee_slot_bookings")
      .update({ slot_id: slotId, held_since: heldSince, booked_by: userId, updated_at: nowIso })
      .eq("case_id", caseId);
    result = await (existing.slot_id ? update.eq("slot_id", existing.slot_id) : update.is("slot_id", null)).select("case_id");
  } else {
    result = await supabaseAdmin
      .from("requestee_slot_bookings")
      .insert({ case_id: caseId, slot_id: slotId, held_since: heldSince, booked_by: userId, updated_at: nowIso })
      .select("case_id");
  }

  const { data, error } = result;
  // Two writes for one case: it was booked in another window.
  if (error?.code === "23505") return fail(CHANGED);
  if (isSlotFullError(error)) {
    return fail("Someone has just booked hours in that time, so it no longer has room for your case. Pick another one.");
  }
  if (error) {
    console.error("[chooseTimeSlot] write failed:", error);
    return fail("Couldn't hold that time. Try again.");
  }
  if (!data?.length) return fail(CHANGED);

  revalidateBooking(caseId);

  // Emails don't decide the booking: it's made, so a failure is only logged.
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = user?.user?.email ?? null;
  if (email) {
    try {
      await sendSlotHeldEmail({
        to: email,
        caseId,
        caseTitle: theCase.title,
        slot,
        dueAt: paymentDueAt(heldSince),
        paid,
        hoursRequested: theCase.hours_requested,
      });
    } catch (err) {
      console.error("[chooseTimeSlot] firm email failed:", err);
    }
  }
  try {
    const switched = existing?.slot ?? null;
    await sendSlotTeamNotice({
      subject: switched ? `Firm changed its time: ${theCase.title}` : `Firm booked a time: ${theCase.title}`,
      heading: switched ? "A firm changed its booked time" : "A firm booked a time",
      caseId,
      rows: [
        ["Firm", await firmName(userId, email)],
        ["Case", theCase.title],
        ["Time", describeSlot(slot)],
        ...(switched ? ([["Previous time", describeSlot(switched)]] as Array<[string, string]>) : []),
        ["Payment", paid ? "Already paid" : `Due ${formatDeadline(paymentDueAt(heldSince))}`],
      ],
    });
  } catch (err) {
    console.error("[chooseTimeSlot] team notice failed:", err);
  }

  return { ok: true, slot, paid, dueAt: due };
}

/* =========================
   CANCEL A HELD TIME
   The clock keeps running, so cancelling and booking again doesn't buy more
   time to pay. A paid time is the admin's to change.
========================= */

export async function cancelMyTimeSlot(caseId: string): Promise<{ ok: true } | Failure> {
  const userId = await requireRequestee();
  if (!isUuid(caseId)) return fail("That case doesn't exist.");

  const theCase = await loadOwnCase(caseId, userId);
  if (!theCase) return fail("That case doesn't exist.");
  const blocked = blocker(theCase);
  if (blocked) return fail(blocked);

  const existing = (await getBookingsForCases([caseId])).get(caseId);
  if (!existing?.slot_id || !existing.slot) return { ok: true };
  if (existing.paid_at) return fail(`This time is paid for. To change or cancel it, ${CONTACT}.`);

  const { data, error } = await supabaseAdmin
    .from("requestee_slot_bookings")
    .update({ slot_id: null, updated_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("slot_id", existing.slot_id)
    .select("case_id");
  if (error) {
    console.error("[cancelMyTimeSlot] update failed:", error);
    return fail("Couldn't cancel that time. Try again.");
  }
  if (!data?.length) return fail(CHANGED);

  revalidateBooking(caseId);

  try {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
    await sendSlotTeamNotice({
      subject: `Firm cancelled its time: ${theCase.title}`,
      heading: "A firm cancelled its booked time",
      caseId,
      rows: [
        ["Firm", await firmName(userId, user?.user?.email ?? null)],
        ["Case", theCase.title],
        ["Released time", describeSlot(existing.slot)],
      ],
    });
  } catch (err) {
    console.error("[cancelMyTimeSlot] team notice failed:", err);
  }

  return { ok: true };
}
