import { supabaseAdmin } from "@/lib/supabase/admin";
import { bookingState, firmLabel, paymentDueAt, slotFitsHours } from "@/lib/slotBooking";
import type { BookingView, SlotBookingRow } from "@/lib/slotBooking";
import { billableHours } from "@/lib/receipt-pricing";
import type { TimeSlot } from "@/lib/requesteeTimeSlots";

/**
 * Reads bookings with the service role, with what the screens need about each
 * case and its firm. Not a server action, so nothing here can be called from a
 * browser. The service role sees every firm's bookings, so a caller checks first
 * that the reader is an admin, or owns every case it asks about.
 */

export type BookedCase = {
  id: string;
  title: string;
  admin_status: string | null;
  status: string | null;
  deleted_at: string | null;
  hours_requested: number | null;
  delivery_mode: string | null;
  /** The firm the case belongs to: requestee_id when set, else the creator. */
  owner_id: string;
};

export type BookingDetail = SlotBookingRow & {
  case: BookedCase;
  firm: { name: string | null; email: string | null };
};

type CaseRow = Omit<BookedCase, "owner_id"> & { user_id: string; requestee_id: string | null };

const CASE_COLUMNS = "id, title, admin_status, status, deleted_at, hours_requested, delivery_mode, user_id, requestee_id";
const BOOKING_COLUMNS = "case_id, slot_id, booked_by, held_since, paid_at";

async function withCasesAndFirms(rows: SlotBookingRow[]): Promise<BookingDetail[]> {
  if (!rows.length) return [];

  const { data: cases, error: caseError } = await supabaseAdmin
    .from("cases")
    .select(CASE_COLUMNS)
    .in("id", rows.map((r) => r.case_id));
  if (caseError) throw new Error(`Couldn't read the booked cases: ${caseError.message}`);

  const caseById = new Map(
    ((cases ?? []) as CaseRow[]).map((c) => [
      c.id,
      {
        id: c.id,
        title: c.title,
        admin_status: c.admin_status,
        status: c.status,
        deleted_at: c.deleted_at,
        hours_requested: c.hours_requested,
        delivery_mode: c.delivery_mode,
        owner_id: c.requestee_id || c.user_id,
      },
    ])
  );
  const ownerIds = Array.from(new Set(Array.from(caseById.values()).map((c) => c.owner_id)));

  const [{ data: agreements }, { data: roles }] = await Promise.all([
    supabaseAdmin
      .from("confidentiality_agreements_requestee")
      .select("user_id, first_name, last_name")
      .in("user_id", ownerIds),
    supabaseAdmin.from("roles").select("user_id, email").in("user_id", ownerIds),
  ]);

  const nameById = new Map(
    (agreements ?? []).map((a) => [
      a.user_id as string,
      `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || null,
    ])
  );
  const emailById = new Map((roles ?? []).map((r) => [r.user_id as string, (r.email as string | null) ?? null]));

  return rows.flatMap((row) => {
    const bookedCase = caseById.get(row.case_id);
    if (!bookedCase) return [];
    return [
      {
        ...row,
        case: bookedCase,
        firm: { name: nameById.get(bookedCase.owner_id) ?? null, email: emailById.get(bookedCase.owner_id) ?? null },
      },
    ];
  });
}

/** The booking holding each of these slots, by slot id. Admins only. */
export async function getBookingsForSlots(slotIds: string[]): Promise<Map<string, BookingDetail>> {
  if (!slotIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("requestee_slot_bookings")
    .select(BOOKING_COLUMNS)
    .in("slot_id", slotIds);
  if (error) throw new Error(`Couldn't read the bookings: ${error.message}`);

  const details = await withCasesAndFirms((data ?? []) as SlotBookingRow[]);
  return new Map(details.filter((d) => d.slot_id).map((d) => [d.slot_id as string, d]));
}

/**
 * The booking record of each of these cases, with its slot, by case id. A case
 * with no record isn't in the map. Admins, or a firm asking about its own cases.
 */
export async function getBookingsForCases(
  caseIds: string[]
): Promise<Map<string, SlotBookingRow & { slot: TimeSlot | null }>> {
  if (!caseIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("requestee_slot_bookings")
    .select(BOOKING_COLUMNS)
    .in("case_id", caseIds);
  if (error) throw new Error(`Couldn't read the bookings: ${error.message}`);

  const rows = (data ?? []) as SlotBookingRow[];
  const slotIds = rows.map((r) => r.slot_id).filter((id): id is string => !!id);
  const slotById = new Map<string, TimeSlot>();
  if (slotIds.length) {
    const { data: slots, error: slotError } = await supabaseAdmin
      .from("requestee_time_slots")
      .select("id, starts_at, ends_at, note")
      .in("id", slotIds);
    if (slotError) throw new Error(`Couldn't read the booked slots: ${slotError.message}`);
    for (const s of (slots ?? []) as TimeSlot[]) slotById.set(s.id, s);
  }

  return new Map(rows.map((r) => [r.case_id, { ...r, slot: r.slot_id ? slotById.get(r.slot_id) ?? null : null }]));
}

/** What the admin screens show about a booked slot, as of `nowMs`. */
export function toBookingView(detail: BookingDetail, slot: TimeSlot, nowMs: number): BookingView {
  const state = bookingState(slot, detail, nowMs);
  const warnings: string[] = [];
  if (detail.case.deleted_at) warnings.push("The firm archived this case.");
  else if (detail.case.admin_status === "rejected") warnings.push("This case was rejected.");
  if (detail.case.delivery_mode === "offline") warnings.push("This case is now in person; slots are for online focus groups.");
  if (!slotFitsHours(slot, detail.case.hours_requested)) {
    const hours = billableHours(detail.case.hours_requested);
    warnings.push(`The case asks for ${hours} hour${hours === 1 ? "" : "s"}, longer than this slot.`);
  }

  return {
    caseId: detail.case_id,
    slotId: slot.id,
    caseTitle: detail.case.title,
    firm: firmLabel(detail.firm.name, detail.firm.email),
    state: state === "open" ? "unpaid" : state,
    paidAt: detail.paid_at,
    dueAt: detail.held_since ? paymentDueAt(detail.held_since).toISOString() : null,
    warnings,
  };
}

/**
 * Slots nobody holds that start between `from` and `to`, earliest first: what an
 * admin can move a booking to, and what a firm can pick from. Only the slot's
 * own fields, never anything about other firms.
 */
export async function getOpenSlots(from: string, to: string): Promise<TimeSlot[]> {
  const { data, error } = await supabaseAdmin
    .from("requestee_time_slots")
    .select("id, starts_at, ends_at, note")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Couldn't read the time slots: ${error.message}`);

  const slots = (data ?? []) as TimeSlot[];
  if (!slots.length) return [];

  const { data: held, error: heldError } = await supabaseAdmin
    .from("requestee_slot_bookings")
    .select("slot_id")
    .in("slot_id", slots.map((s) => s.id));
  if (heldError) throw new Error(`Couldn't read the bookings: ${heldError.message}`);

  const heldIds = new Set((held ?? []).map((h) => h.slot_id as string));
  return slots.filter((s) => !heldIds.has(s.id));
}
