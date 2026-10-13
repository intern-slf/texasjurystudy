import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import TimeSlotCalendar from "@/components/TimeSlotCalendar";
import {
  datesToInstantRange,
  isMonthKey,
  monthGridDates,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";

/* =========================
   PAGE
========================= */

export default async function RequesteeTimeSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const todayKey = slotDateKey(Date.now());
  const monthKey = isMonthKey(params.month) ? params.month : todayKey.slice(0, 7);

  // Every slot starting on a date the grid shows, including the days of the
  // neighbouring months that fill its first and last weeks.
  const dates = monthGridDates(monthKey);
  const { from, to } = datesToInstantRange(dates[0], dates[dates.length - 1]);

  // The admin layout has checked the role. This client is the signed-in
  // admin's, and RLS lets only admins read the table.
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

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Time Slots</h2>
          <p className="text-muted-foreground mt-1">
            Times law firms can book for an online focus group, in Central Time. Only admins can
            see them for now.
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
        <TimeSlotCalendar monthKey={monthKey} todayKey={todayKey} slots={(data ?? []) as TimeSlot[]} />
      )}
    </div>
  );
}
