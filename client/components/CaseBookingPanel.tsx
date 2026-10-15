import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getBookingsForCases,
  getBookingsForSlots,
  getOpenSlots,
  toBookingView,
  type BookingDetail,
} from "@/lib/slotBookingData";
import { describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";
import { slotFitsHours } from "@/lib/slotBooking";
import BookingSummary from "@/components/BookingSummary";
import BookingAdminControls from "@/components/BookingAdminControls";
import AssignSlotControl from "@/components/AssignSlotControl";

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

/** The panel with one line in it, for when its data can't be read. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-8">
      <h3 className="mb-4 text-xl font-bold">Time slot</h3>
      <p className="text-sm text-slate-600">{children}</p>
    </section>
  );
}

/**
 * The admin case page's "Time slot" box: the slot the case holds and its payment,
 * with the admin's controls, or a way to book one for the firm.
 *
 * Reads with the service role (the firm's name and booking), so it checks for an
 * admin itself rather than relying on the layout, whose check doesn't re-run on
 * every client-side navigation.
 */
export default async function CaseBookingPanel({ caseId }: { caseId: string }) {
  try {
    await requireAdmin();
  } catch {
    return null;
  }

  const nowMs = Date.now();
  // Read alongside the rest. The open times are only somewhere to move or book
  // to, so if they can't be read the booking still shows, with a note instead.
  // An admin can book into any slot with room, its session's invitations or not.
  const openSlotsRead = getOpenSlots(
    new Date(nowMs).toISOString(),
    new Date(nowMs + SIX_MONTHS_MS).toISOString(),
    { includeClosed: true }
  ).then(
    (slots) => ({ slots, failed: false }),
    (err: unknown) => {
      console.error("[CaseBookingPanel] couldn't read the open times:", err);
      return { slots: [] as TimeSlot[], failed: true };
    }
  );

  let loaded;
  try {
    loaded = await Promise.all([
      supabaseAdmin
        .from("cases")
        .select("admin_status, status, deleted_at, delivery_mode, hours_requested")
        .eq("id", caseId)
        .maybeSingle(),
      getBookingsForCases([caseId]),
    ]);
  } catch (err) {
    // On a new deploy, most likely the booking tables don't exist yet. The rest
    // of the case page still works.
    console.error("[CaseBookingPanel] couldn't read the booking:", err);
    return (
      <Notice>
        Couldn&apos;t load this case&apos;s time slot. Reload the page. If this is a new deploy, check that the
        time-slot migrations (20261014_requestee_time_slots.sql, then 20261016_requestee_slot_bookings.sql) have
        been run.
      </Notice>
    );
  }
  const [{ data: theCase, error: caseError }, records] = loaded;
  if (caseError) {
    console.error("[CaseBookingPanel] couldn't read the case:", caseError.message);
    return <Notice>Couldn&apos;t load this case&apos;s time slot. Reload the page.</Notice>;
  }
  if (!theCase) return null;

  const record = records.get(caseId);
  const slot = record?.slot ?? null;

  const { slots: openSlots, failed: openSlotsFailed } = await openSlotsRead;
  const openSlotsNote = openSlotsFailed ? (
    <p className="text-sm text-amber-700">
      Couldn&apos;t load the open times, so there&apos;s nothing to move or book to. Reload the page.
    </p>
  ) : null;

  let content: React.ReactNode;
  if (slot) {
    // The read above found this slot, so the tables exist: a failure here is a
    // real one, not a booking that changed while the page loaded.
    let detail: BookingDetail | undefined;
    try {
      // Other cases can share the slot; this is this case's booking in it.
      detail = (await getBookingsForSlots([slot.id])).get(slot.id)?.find((d) => d.case_id === caseId);
    } catch (err) {
      console.error("[CaseBookingPanel] couldn't read the booking's details:", err);
      return <Notice>Couldn&apos;t load this case&apos;s booking. Reload the page.</Notice>;
    }
    const booking = detail ? toBookingView(detail, slot, nowMs) : null;
    content = booking ? (
      <div className="space-y-4">
        <p className="text-base font-semibold text-slate-800">{describeSlot(slot)}</p>
        <BookingSummary booking={booking} showCaseLink={false} />
        <BookingAdminControls booking={booking} openSlots={openSlots} openSlotsUnavailable={openSlotsFailed} />
        {openSlotsNote}
      </div>
    ) : (
      <p className="text-sm text-slate-600">The booking changed while the page loaded. Refresh the page.</p>
    );
  } else if (theCase.delivery_mode === "offline") {
    content = (
      <p className="text-sm text-slate-600">
        In-person case. Time slots are for online focus groups, so the firm arranges its time with us by email.
      </p>
    );
  } else if (theCase.admin_status === "rejected" || theCase.deleted_at || theCase.status !== "current") {
    content = <p className="text-sm text-slate-600">No time held. The case is rejected or archived.</p>;
  } else {
    content = (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          No time held.{record?.held_since ? " The firm's payment clock is still running from an earlier hold." : ""}
        </p>
        {openSlotsNote ?? (
          <AssignSlotControl
            caseId={caseId}
            openSlots={openSlots.filter((s) => slotFitsHours(s, theCase.hours_requested))}
          />
        )}
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-8">
      <h3 className="mb-4 text-xl font-bold">Time slot</h3>
      {content}
    </section>
  );
}
