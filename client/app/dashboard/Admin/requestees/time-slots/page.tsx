import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/requireAdmin";
import BackButton from "@/components/BackButton";
import TimeSlotCalendar from "@/components/TimeSlotCalendar";
import { getBookingsForSlots, getOpenSlots, toBookingView } from "@/lib/slotBookingData";
import { isOutsideSlot, type BookingView } from "@/lib/slotBooking";
import { caseSessionTime, type CaseSessionRow } from "@/lib/case/caseSessionTime";
import { formatSessionDate } from "@/lib/timezone";
import {
  datesToInstantRange,
  isMonthKey,
  monthGridDates,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

/* =========================
   PAGE
========================= */

export default async function RequesteeTimeSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Firms' names and bookings are read with the service role below, so this page
  // checks for an admin itself: the layout's check doesn't re-run on every
  // client-side navigation (F28).
  await requireAdminPage();

  const params = await searchParams;
  const nowMs = Date.now();
  const todayKey = slotDateKey(nowMs);
  const monthKey = isMonthKey(params.month) ? params.month : todayKey.slice(0, 7);

  // Every slot starting on a date the grid shows, including the days of the
  // neighbouring months that fill its first and last weeks.
  const dates = monthGridDates(monthKey);
  const { from, to } = datesToInstantRange(dates[0], dates[dates.length - 1]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requestee_time_slots")
    .select("id, starts_at, ends_at, note")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true });

  if (error) console.error("[time slots page] select failed:", error);

  // PGRST205 / 42P01: the table isn't there, i.e. the migration hasn't been run.
  const tableMissing = error?.code === "PGRST205" || error?.code === "42P01";
  const slots = (data ?? []) as TimeSlot[];

  // Who holds hours in each slot (several cases can share one). If bookings
  // can't be read, the calendar still shows the slots, with a warning, rather
  // than every booked slot looking open.
  const bookings: Record<string, BookingView[]> = {};
  let openSlots: TimeSlot[] = [];
  let bookingsUnavailable = false;
  if (!error) {
    try {
      const [details, open] = await Promise.all([
        getBookingsForSlots(slots.map((s) => s.id)),
        // An admin can move or add a case into any slot with room, invitations or not.
        getOpenSlots(new Date(nowMs).toISOString(), new Date(nowMs + SIX_MONTHS_MS).toISOString(), {
          includeClosed: true,
        }),
      ]);
      for (const slot of slots) {
        const inSlot = details.get(slot.id);
        if (inSlot?.length) bookings[slot.id] = inSlot.map((detail) => toBookingView(detail, slot, nowMs));
      }
      openSlots = open;
    } catch (err) {
      console.error("[time slots page] bookings failed:", err);
      bookingsUnavailable = true;
    }
  }

  // The session each booked case is in, once one is built: the slot's cases
  // make one session. Without it the calendar still works, just without them.
  const bookedCaseIds = Object.values(bookings).flat().map((b) => b.caseId);
  if (bookedCaseIds.length) {
    const { data: sessionRows, error: sessionError } = await supabase
      .from("session_cases")
      .select("case_id, session_id, start_time, end_time, sessions(session_date)")
      .in("case_id", bookedCaseIds);
    if (sessionError) console.error("[time slots page] sessions failed:", sessionError.message);
    type SessionRow = CaseSessionRow & { case_id: string; session_id: string };
    const rowsByCase = new Map<string, SessionRow[]>();
    for (const row of (sessionRows ?? []) as SessionRow[]) {
      rowsByCase.set(row.case_id, [...(rowsByCase.get(row.case_id) ?? []), row]);
    }
    // Which of those sessions have invited anyone: that closes their slots to firms.
    const sessionIds = Array.from(new Set(((sessionRows ?? []) as SessionRow[]).map((r) => r.session_id)));
    const invited = new Set<string>();
    if (sessionIds.length) {
      const { data: invites, error: inviteError } = await supabase
        .from("session_participants")
        .select("session_id")
        .in("session_id", sessionIds);
      if (inviteError) console.error("[time slots page] invitations failed:", inviteError.message);
      for (const r of invites ?? []) invited.add(r.session_id as string);
    }
    for (const slot of slots) {
      bookings[slot.id] = (bookings[slot.id] ?? []).map((booking) => {
        const rows = rowsByCase.get(booking.caseId) ?? [];
        const time = caseSessionTime(rows);
        // The row caseSessionTime read: the latest session the case is in.
        const row = time ? rows.find((r) => (Array.isArray(r.sessions) ? r.sessions[0] : r.sessions)?.session_date === time.sessionDate) : undefined;
        return {
          ...booking,
          session:
            time && row
              ? {
                  id: row.session_id,
                  date: formatSessionDate(time.sessionDate, "short"),
                  time: time.time,
                  outsideSlot: isOutsideSlot(time.start, time.end, slot),
                  invited: invited.has(row.session_id),
                }
              : null,
        };
      });
      if (!bookings[slot.id].length) delete bookings[slot.id];
    }
  }

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Time Slots</h2>
          <p className="text-muted-foreground mt-1">
            Times law firms can book for an online focus group, in Central Time.
          </p>
        </div>

        <BackButton href="/dashboard/Admin/requestees" label="Back to Requestees" />
      </div>

      {/* ================= CONTENT ================= */}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
          {tableMissing
            ? "The time slots table doesn't exist yet. Run supabase/migrations/20261014_requestee_time_slots.sql in the Supabase SQL Editor, then reload this page."
            : "Couldn't load the time slots. Reload the page to try again."}
        </div>
      ) : (
        <>
          {bookingsUnavailable && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
              Couldn&apos;t load which slots are booked, so booked slots may look open. If this is a new
              deploy, run supabase/migrations/20261016_requestee_slot_bookings.sql in the Supabase SQL
              Editor, then reload.
            </div>
          )}
          <TimeSlotCalendar
            monthKey={monthKey}
            todayKey={todayKey}
            slots={slots}
            bookings={bookings}
            openSlots={openSlots}
          />
        </>
      )}
    </div>
  );
}
