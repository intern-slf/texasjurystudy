"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/requireAdmin";
import { TIME_SLOTS_PATH, describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";
import { firmLabel, formatDeadline, isSlotFullError, paymentDueAt } from "@/lib/slotBooking";
import { getBookingsForCases } from "@/lib/slotBookingData";
import {
  sendSlotHeldEmail,
  sendSlotMovedEmail,
  sendSlotReleasedEmail,
  sendSlotTeamNotice,
} from "@/lib/slotBookingEmails";

// Every export here is an admin action and starts with requireAdmin(): as server
// actions they can be called by anyone signed in, with any arguments. Writes go
// through the admin's own client, so the table's admin-only RLS policy checks
// each one again. Reads of the case and the firm use the service role, after
// that check.
//
// Every write names the state the admin was looking at (the slot the case holds,
// or "none"), so if a firm or another admin changed the booking in the meantime,
// nothing is overwritten: the admin is told to refresh.
//
// A failed email never undoes a change. The result carries a warning instead,
// so the admin knows to contact the firm.

type Result = { ok: true; warning?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const fail = (error: string): Result => ({ ok: false, error });
const CHANGED = "This booking changed since the page loaded. Refresh the page and try again.";

type CaseInfo = {
  id: string;
  title: string;
  admin_status: string | null;
  status: string | null;
  deleted_at: string | null;
  delivery_mode: string | null;
  hours_requested: number | null;
  owner_id: string;
};

async function loadCase(caseId: string): Promise<CaseInfo | null> {
  const { data } = await supabaseAdmin
    .from("cases")
    .select("id, title, admin_status, status, deleted_at, delivery_mode, hours_requested, user_id, requestee_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    admin_status: data.admin_status,
    status: data.status,
    deleted_at: data.deleted_at,
    delivery_mode: data.delivery_mode,
    hours_requested: data.hours_requested,
    owner_id: data.requestee_id || data.user_id,
  };
}

async function loadSlot(slotId: string): Promise<TimeSlot | null> {
  const { data } = await supabaseAdmin
    .from("requestee_time_slots")
    .select("id, starts_at, ends_at, note")
    .eq("id", slotId)
    .maybeSingle();
  return (data as TimeSlot | null) ?? null;
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function firmName(ownerId: string, email: string | null): Promise<string> {
  const { data } = await supabaseAdmin
    .from("confidentiality_agreements_requestee")
    .select("first_name, last_name")
    .eq("user_id", ownerId)
    .maybeSingle();
  return firmLabel(data ? `${data.first_name ?? ""} ${data.last_name ?? ""}` : null, email);
}

/** Sends the firm's email and the team's notice; returns a warning if the firm's failed. */
async function notify(
  firmEmail: string | null,
  sendToFirm: (to: string) => Promise<void>,
  teamNotice: Parameters<typeof sendSlotTeamNotice>[0]
): Promise<string | undefined> {
  let warning: string | undefined;
  if (!firmEmail) {
    warning = "The firm has no email address on file, so it wasn't told. Contact it directly.";
  } else {
    try {
      await sendToFirm(firmEmail);
    } catch (err) {
      console.error("[adminSlotBooking] firm email failed:", err);
      warning = `Saved, but the email to ${firmEmail} failed. Let the firm know directly.`;
    }
  }
  try {
    await sendSlotTeamNotice(teamNotice);
  } catch (err) {
    console.error("[adminSlotBooking] team notice failed:", err);
  }
  return warning;
}

function revalidateBooking(caseId: string) {
  revalidatePath(TIME_SLOTS_PATH);
  revalidatePath("/dashboard/Admin");
  revalidatePath(`/dashboard/Admin/${caseId}`);
  revalidatePath(`/dashboard/requestee/${caseId}`);
}

async function adminLabel(adminId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("roles").select("email").eq("user_id", adminId).maybeSingle();
  return (data?.email as string | null) ?? "an admin";
}

/* =========================
   PAYMENT
========================= */

export async function markBookingPaid(caseId: string): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId)) return fail("That booking doesn't exist.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("requestee_slot_bookings")
    .update({ paid_at: now, paid_by: adminId, updated_at: now })
    .eq("case_id", caseId)
    .is("paid_at", null)
    .select("case_id");

  if (error) {
    console.error("[markBookingPaid] update failed:", error);
    return fail("Couldn't mark it paid. Try again.");
  }
  if (!data?.length) return fail("Nothing changed. Refresh the page: it may already be marked paid.");

  revalidateBooking(caseId);
  return { ok: true };
}

export async function markBookingUnpaid(caseId: string): Promise<Result> {
  await requireAdmin();
  if (!isUuid(caseId)) return fail("That booking doesn't exist.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requestee_slot_bookings")
    .update({ paid_at: null, paid_by: null, updated_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .not("paid_at", "is", null)
    .select("case_id");

  if (error) {
    console.error("[markBookingUnpaid] update failed:", error);
    return fail("Couldn't mark it unpaid. Try again.");
  }
  if (!data?.length) return fail("Nothing changed. Refresh the page: it may already be marked unpaid.");

  revalidateBooking(caseId);
  return { ok: true };
}

/* =========================
   RELEASE A HOLD
   "unpaid": payment didn't arrive by the deadline. The clock stops, so if the
   firm books again it gets a fresh working day. Refused before the deadline,
   or once paid, so the firm is never told it didn't pay when it still could.
   "other": any other reason (the firm asked, the time fell through). The
   payment clock and any payment stay with the case.
========================= */

export async function cancelBooking(
  caseId: string,
  expectedSlotId: string,
  reason: "unpaid" | "other"
): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId) || !isUuid(expectedSlotId)) return fail("That booking doesn't exist.");
  if (reason !== "unpaid" && reason !== "other") return fail("Pick a reason for releasing it.");

  const booking = (await getBookingsForCases([caseId])).get(caseId);
  if (!booking || booking.slot_id !== expectedSlotId || !booking.slot) return fail(CHANGED);

  if (reason === "unpaid") {
    if (booking.paid_at) return fail("This booking is marked paid, so it can't be released for non-payment.");
    const due = booking.held_since ? paymentDueAt(booking.held_since) : null;
    if (!due || Date.now() < due.getTime()) {
      return fail(due ? `Payment isn't due until ${formatDeadline(due)}.` : "This hold has no payment deadline.");
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requestee_slot_bookings")
    .update({
      slot_id: null,
      ...(reason === "unpaid" ? { held_since: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("case_id", caseId)
    .eq("slot_id", expectedSlotId)
    .select("case_id");

  if (error) {
    console.error("[cancelBooking] update failed:", error);
    return fail("Couldn't release the time. Try again.");
  }
  if (!data?.length) return fail(CHANGED);

  revalidateBooking(caseId);

  const theCase = await loadCase(caseId);
  if (!theCase) return { ok: true };
  const firmEmail = await emailOf(theCase.owner_id);
  const canRebook =
    theCase.admin_status === "all" &&
    theCase.status === "current" &&
    !theCase.deleted_at &&
    theCase.delivery_mode !== "offline";

  const warning = await notify(
    firmEmail,
    (to) =>
      sendSlotReleasedEmail({ to, caseId, caseTitle: theCase.title, slot: booking.slot!, reason, canRebook }),
    {
      subject: `Hold released: ${theCase.title}`,
      heading: "A held time was released",
      caseId,
      rows: [
        ["Firm", await firmName(theCase.owner_id, firmEmail)],
        ["Case", theCase.title],
        ["Time", describeSlot(booking.slot)],
        ["Reason", reason === "unpaid" ? "Not paid by the deadline" : "Released by an admin"],
        ["By", await adminLabel(adminId)],
      ],
    }
  );
  return { ok: true, warning };
}

/* =========================
   MOVE A BOOKING
   Keeps the payment clock and any payment. The new slot only has to be free and
   in the future: an admin may knowingly pick a shorter one, and the case page
   warns about it.
========================= */

export async function moveBooking(caseId: string, fromSlotId: string, toSlotId: string): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId) || !isUuid(fromSlotId) || !isUuid(toSlotId)) return fail("That booking doesn't exist.");
  if (fromSlotId === toSlotId) return fail("Pick a different time to move it to.");

  const booking = (await getBookingsForCases([caseId])).get(caseId);
  if (!booking || booking.slot_id !== fromSlotId || !booking.slot) return fail(CHANGED);

  const toSlot = await loadSlot(toSlotId);
  if (!toSlot) return fail("That time slot no longer exists. Refresh the page.");
  if (Date.parse(toSlot.starts_at) <= Date.now()) return fail("That time has already started. Pick a later one.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requestee_slot_bookings")
    .update({ slot_id: toSlotId, updated_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("slot_id", fromSlotId)
    .select("case_id");

  // Other cases share slots; the database refuses a move past the slot's hours.
  if (isSlotFullError(error)) return fail("That time doesn't have enough hours left for this case. Pick a different one.");
  if (error) {
    console.error("[moveBooking] update failed:", error);
    return fail("Couldn't move the booking. Try again.");
  }
  if (!data?.length) return fail(CHANGED);

  revalidateBooking(caseId);

  const theCase = await loadCase(caseId);
  if (!theCase) return { ok: true };
  const firmEmail = await emailOf(theCase.owner_id);
  const warning = await notify(
    firmEmail,
    (to) => sendSlotMovedEmail({ to, caseId, caseTitle: theCase.title, from: booking.slot!, toSlot }),
    {
      subject: `Booking moved: ${theCase.title}`,
      heading: "A booking was moved",
      caseId,
      rows: [
        ["Firm", await firmName(theCase.owner_id, firmEmail)],
        ["Case", theCase.title],
        ["New time", describeSlot(toSlot)],
        ["Previous time", describeSlot(booking.slot)],
        ["By", await adminLabel(adminId)],
      ],
    }
  );
  return { ok: true, warning };
}

/* =========================
   BOOK A SLOT FOR A FIRM
   For a firm that asked us for a time, or one whose hold was released. Only for
   online cases that aren't rejected or archived. A case with no clock running
   starts one now.
========================= */

export async function assignSlot(caseId: string, slotId: string): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId) || !isUuid(slotId)) return fail("That case or time slot doesn't exist.");

  const theCase = await loadCase(caseId);
  if (!theCase) return fail("That case doesn't exist.");
  if (theCase.delivery_mode === "offline") return fail("Time slots are for online focus groups only.");
  if (theCase.admin_status === "rejected" || theCase.deleted_at || theCase.status !== "current") {
    return fail("This case is rejected or archived, so it can't hold a time.");
  }

  const slot = await loadSlot(slotId);
  if (!slot) return fail("That time slot no longer exists. Refresh the page.");
  if (Date.parse(slot.starts_at) <= Date.now()) return fail("That time has already started. Pick a later one.");

  const existing = (await getBookingsForCases([caseId])).get(caseId);
  if (existing?.slot_id) return fail("This case already holds a time. Move it instead.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const heldSince = existing?.held_since ?? now;
  const write = existing
    ? supabase
        .from("requestee_slot_bookings")
        .update({ slot_id: slotId, held_since: heldSince, booked_by: adminId, updated_at: now })
        .eq("case_id", caseId)
        .is("slot_id", null)
        .select("case_id")
    : supabase
        .from("requestee_slot_bookings")
        .insert({ case_id: caseId, slot_id: slotId, held_since: heldSince, booked_by: adminId, updated_at: now })
        .select("case_id");
  const { data, error } = await write;

  // Two writes for one case: someone else booked it in the meantime.
  if (error?.code === "23505") return fail(CHANGED);
  // Other cases share slots; the database refuses a booking past the slot's hours.
  if (isSlotFullError(error)) return fail("That time doesn't have enough hours left for this case. Pick a different one.");
  if (error) {
    console.error("[assignSlot] write failed:", error);
    return fail("Couldn't book the time. Try again.");
  }
  if (!data?.length) return fail(CHANGED);

  revalidateBooking(caseId);

  const firmEmail = await emailOf(theCase.owner_id);
  const paid = !!existing?.paid_at;
  const dueAt = paymentDueAt(heldSince);
  const warning = await notify(
    firmEmail,
    (to) =>
      sendSlotHeldEmail({ to, caseId, caseTitle: theCase.title, slot, dueAt, paid, hoursRequested: theCase.hours_requested }),
    {
      subject: `Time booked for a firm: ${theCase.title}`,
      heading: "An admin booked a time for a firm",
      caseId,
      rows: [
        ["Firm", await firmName(theCase.owner_id, firmEmail)],
        ["Case", theCase.title],
        ["Time", describeSlot(slot)],
        ["Payment", paid ? "Already paid" : `Due ${formatDeadline(dueAt)}`],
        ["By", await adminLabel(adminId)],
      ],
    }
  );
  return { ok: true, warning };
}
