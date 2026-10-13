import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/requireAdmin";
import BackButton from "@/components/BackButton";
import TimeSlotCalendar from "@/components/TimeSlotCalendar";
import { getBookingsForSlots, getOpenSlots, toBookingView } from "@/lib/slotBookingData";
import type { BookingView } from "@/lib/slotBooking";
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
  // client-side navigation.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

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

  // Who holds each slot. If bookings can't be read, the calendar still shows the
  // slots, with a warning, rather than every booked slot looking open.
  const bookings: Record<string, BookingView> = {};
  let openSlots: TimeSlot[] = [];
  let bookingsUnavailable = false;
  if (!error) {
    try {
      const [details, open] = await Promise.all([
        getBookingsForSlots(slots.map((s) => s.id)),
        getOpenSlots(new Date(nowMs).toISOString(), new Date(nowMs + SIX_MONTHS_MS).toISOString()),
      ]);
      for (const slot of slots) {
        const detail = details.get(slot.id);
        if (detail) bookings[slot.id] = toBookingView(detail, slot, nowMs);
      }
      openSlots = open;
    } catch (err) {
      console.error("[time slots page] bookings failed:", err);
      bookingsUnavailable = true;
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
