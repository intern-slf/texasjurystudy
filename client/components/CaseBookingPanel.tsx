import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBookingsForCases, getBookingsForSlots, getOpenSlots, toBookingView } from "@/lib/slotBookingData";
import { describeSlot } from "@/lib/requesteeTimeSlots";
import { slotFitsHours } from "@/lib/slotBooking";
import BookingSummary from "@/components/BookingSummary";
import BookingAdminControls from "@/components/BookingAdminControls";
import AssignSlotControl from "@/components/AssignSlotControl";

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

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
  let loaded;
  try {
    loaded = await Promise.all([
      supabaseAdmin
        .from("cases")
        .select("admin_status, status, deleted_at, delivery_mode, hours_requested")
        .eq("id", caseId)
        .maybeSingle(),
      getBookingsForCases([caseId]),
      getOpenSlots(new Date(nowMs).toISOString(), new Date(nowMs + SIX_MONTHS_MS).toISOString()),
    ]);
  } catch (err) {
    // Most likely the booking tables don't exist yet (migrations not run). The
    // rest of the case page still works.
    console.error("[CaseBookingPanel] couldn't read the booking:", err);
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm sm:p-8">
        <h3 className="mb-4 text-xl font-bold">Time slot</h3>
        <p className="text-sm text-slate-600">
          Couldn&apos;t load this case&apos;s time slot. If this is a new deploy, run the time-slot migrations
          (20261014_requestee_time_slots.sql, then 20261016_requestee_slot_bookings.sql) and reload.
        </p>
      </section>
    );
  }
  const [{ data: theCase }, records, openSlots] = loaded;
  if (!theCase) return null;

  const record = records.get(caseId);
  const slot = record?.slot ?? null;

  let content: React.ReactNode;
  if (slot) {
    const detail = (await getBookingsForSlots([slot.id]).catch(() => new Map())).get(slot.id);
    const booking = detail ? toBookingView(detail, slot, nowMs) : null;
    content = booking ? (
      <div className="space-y-4">
        <p className="text-base font-semibold text-slate-800">{describeSlot(slot)}</p>
        <BookingSummary booking={booking} showCaseLink={false} />
        <BookingAdminControls booking={booking} openSlots={openSlots} />
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
        <AssignSlotControl
          caseId={caseId}
          openSlots={openSlots.filter((s) => slotFitsHours(s, theCase.hours_requested))}
        />
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
