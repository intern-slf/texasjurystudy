"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AddTimeSlotsDialog from "@/components/AddTimeSlotsDialog";
import BookingAdminControls from "@/components/BookingAdminControls";
import BookingSummary, { BOOKING_STATE_CLASSES, BookingStateBadge } from "@/components/BookingSummary";
import TimeSlotModal from "@/components/TimeSlotModal";
import { deleteRequesteeTimeSlot } from "@/lib/actions/requesteeTimeSlots";
import { addSlotCasesToSession } from "@/lib/actions/session";
import {
  SLOT_TIME_ZONE_LABEL,
  TIME_SLOTS_PATH,
  addDays,
  formatDateKey,
  formatMonthKey,
  formatSlotRange,
  monthGridDates,
  shiftMonth,
  slotDateKey,
  type TimeSlot,
} from "@/lib/requesteeTimeSlots";
import { slotMinutes, type BookingState, type BookingView } from "@/lib/slotBooking";
import { formatMinutes } from "@/lib/case/paidTime";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Slots listed in a day cell before it says "+N more". The list under the calendar has them all. */
const CHIPS_PER_DAY = 3;
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

/** The state a slot's chip shows: the one most needing the admin, of all its bookings. */
const STATE_URGENCY: Exclude<BookingState, "open">[] = ["overdue", "past", "unpaid", "paid"];
function slotState(list: BookingView[]): Exclude<BookingState, "open"> {
  return STATE_URGENCY.find((state) => list.some((b) => b.state === state)) ?? "paid";
}

/** "1 of 3 hours booked · 2 hours left", or "3 of 3 hours booked · full". */
function slotHoursLine(slot: TimeSlot, list: BookingView[]): string {
  const total = slotMinutes(slot);
  const booked = list.reduce((sum, b) => sum + b.minutes, 0);
  const left = total - booked;
  const bookedText = `${formatMinutes(booked).replace(/ hours?$/, "")} of ${formatMinutes(total)} booked`;
  return left > 0 ? `${bookedText} · ${formatMinutes(left)} left` : `${bookedText} · full`;
}

/** Where a booked case's session stands: built (and whether it keeps to the slot), or not yet. */
export function SessionLine({ booking }: { booking: BookingView }) {
  if (!booking.session) {
    return <p className="text-xs text-slate-500">No session built yet.</p>;
  }
  return (
    <div className="space-y-1 text-xs">
      <p className="text-slate-700">
        In session:{" "}
        <Link href="/dashboard/Admin/sessions" className="font-medium text-blue-700 hover:underline">
          {booking.session.date}
          {booking.session.time ? `, ${booking.session.time}` : ""}
        </Link>
      </p>
      {booking.session.outsideSlot && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
          The session runs outside this booked slot. Reschedule it, or move the booking.
        </p>
      )}
    </div>
  );
}

/**
 * What the slot's cases that can go into a session (approved, not in one yet)
 * can do. A slot's cases make one session: with none built yet, Build session
 * opens Build Session with them, its date and their times starting from the
 * slot; once one exists, they're added to it after its last case.
 */
export function BuildSessionLink({ slot, list }: { slot: TimeSlot; list: BookingView[] }) {
  const ready = list.filter((b) => b.approved && !b.session);
  const waiting = list.filter((b) => !b.approved && !b.session).length;
  const existing = list.find((b) => b.session)?.session ?? null;
  if (!ready.length && !waiting) return null;
  const query = new URLSearchParams({ slot: slot.id });
  for (const b of ready) query.append("selectedCases", b.caseId);
  const label = `${ready.length} case${ready.length === 1 ? "" : "s"}`;
  return (
    <div className="space-y-1">
      {ready.length > 0 &&
        (existing ? (
          <AddToSessionButton slotId={slot.id} label={label} session={existing} />
        ) : (
          <Button asChild size="sm">
            <Link href={`/dashboard/Admin/sessions/new?${query.toString()}`}>Build session with {label}</Link>
          </Button>
        ))}
      {waiting > 0 && (
        <p className="text-xs text-slate-500">
          {waiting} case{waiting === 1 ? " isn't" : "s aren't"} approved yet, so {waiting === 1 ? "it isn't" : "they aren't"}{" "}
          included.
        </p>
      )}
    </div>
  );
}

/**
 * Adds the slot's waiting cases to the session already built for it. Once its
 * participants are invited, the admin confirms first: they're emailed the new
 * time and repriced, and the panel was chosen without these cases.
 */
function AddToSessionButton({
  slotId,
  label,
  session,
}: {
  slotId: string;
  label: string;
  session: NonNullable<BookingView["session"]>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await addSlotCasesToSession(slotId);
        if (!result.ok) {
          setMessage({ tone: "error", text: result.error });
          return;
        }
        setConfirming(false);
        setMessage({
          tone: "done",
          text: `Added ${result.added} case${result.added === 1 ? "" : "s"} to the session.${result.warning ? ` ${result.warning}` : ""}`,
        });
        router.refresh();
      } catch (err) {
        console.error("[TimeSlotCalendar] add to session failed:", err);
        setMessage({ tone: "error", text: "Something went wrong. Refresh the page and try again." });
      }
    });
  }

  return (
    <div className="space-y-2">
      {session.invited && confirming ? (
        <div className="space-y-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <p>
            This session&apos;s participants are already invited, for a panel chosen without these cases. Those who
            accepted will be emailed the new end time, and their pay will change with the longer session.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={add} disabled={pending}>
              {pending ? "Adding…" : "Add anyway"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Keep as is
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => (session.invited ? setConfirming(true) : add())}
          disabled={pending}
        >
          {pending ? "Adding…" : `Add ${label} to the session on ${session.date}`}
        </Button>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-xs text-red-600" : "text-xs text-green-700"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

const MONTH_NAV_CLASSES =
  "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800";

type Props = {
  /** The month shown, "YYYY-MM". */
  monthKey: string;
  /** Today in Central Time. Passed from the server so its render and the browser's agree. */
  todayKey: string;
  /** The slots starting on any date the grid shows, earliest first. */
  slots: TimeSlot[];
  /** The cases holding hours in each booked slot, by slot id. Several can share one. */
  bookings: Record<string, BookingView[]>;
  /** Free future slots, which a booking can be moved to. */
  openSlots: TimeSlot[];
};

export default function TimeSlotCalendar({ monthKey, todayKey, slots, bookings, openSlots }: Props) {
  const router = useRouter();
  const [addingOn, setAddingOn] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<TimeSlot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const dates = useMemo(() => monthGridDates(monthKey), [monthKey]);

  const slotsByDate = useMemo(() => {
    const byDate = new Map<string, TimeSlot[]>();
    for (const slot of slots) {
      const dateKey = slotDateKey(slot.starts_at);
      byDate.set(dateKey, [...(byDate.get(dateKey) ?? []), slot]);
    }
    return byDate;
  }, [slots]);

  const datesWithSlots = dates.filter((d) => d.startsWith(monthKey) && slotsByDate.has(d));
  const monthSlotCount = datesWithSlots.reduce((n, d) => n + (slotsByDate.get(d)?.length ?? 0), 0);

  // The header button opens on tomorrow, or on the 1st when a later month is shown.
  const tomorrow = addDays(todayKey, 1);
  const firstOfMonth = `${monthKey}-01`;
  const defaultAddDate = firstOfMonth > tomorrow ? firstOfMonth : tomorrow;

  function handleCreated(created: number, firstDate: string) {
    setAddingOn(null);
    setNotice(`Added ${created} time slot${created === 1 ? "" : "s"}.`);
    const month = firstDate.slice(0, 7);
    if (month === monthKey) router.refresh();
    else router.push(`${TIME_SLOTS_PATH}?month=${month}`);
  }

  return (
    <div className="space-y-6">
      {/* ================= MONTH GRID ================= */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-1">
            <Link
              href={`${TIME_SLOTS_PATH}?month=${shiftMonth(monthKey, -1)}`}
              aria-label="Previous month"
              className={MONTH_NAV_CLASSES}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <h3 className="w-36 text-center text-base font-semibold text-slate-800">
              {formatMonthKey(monthKey)}
            </h3>
            <Link
              href={`${TIME_SLOTS_PATH}?month=${shiftMonth(monthKey, 1)}`}
              aria-label="Next month"
              className={MONTH_NAV_CLASSES}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
            {monthKey !== todayKey.slice(0, 7) && (
              <Link
                href={TIME_SLOTS_PATH}
                className="ml-2 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Today
              </Link>
            )}
          </div>

          <Button onClick={() => setAddingOn(defaultAddDate)}>
            <CalendarPlus />
            Add Time Slots
          </Button>
        </div>

        {notice && (
          <p role="status" className="border-b bg-green-50 px-4 py-2 text-sm font-medium text-green-700 sm:px-6">
            {notice}
          </p>
        )}

        <div className="grid grid-cols-7 border-b bg-slate-50">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              <span className="sm:hidden">{day.charAt(0)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {dates.map((dateKey, index) => {
            const daySlots = slotsByDate.get(dateKey) ?? [];
            const inMonth = dateKey.startsWith(monthKey);
            const isToday = dateKey === todayKey;
            const isPast = dateKey < todayKey;

            return (
              <div
                key={dateKey}
                className={cn(
                  "group min-h-16 p-1 sm:min-h-28 sm:p-1.5",
                  index % 7 !== 6 && "border-r",
                  index < dates.length - 7 && "border-b",
                  !inMonth && "bg-slate-50/70"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday
                        ? "bg-blue-600 font-semibold text-white"
                        : inMonth
                          ? "text-slate-700"
                          : "text-slate-400"
                    )}
                  >
                    {Number(dateKey.slice(8))}
                  </span>

                  {!isPast && (
                    <button
                      type="button"
                      onClick={() => setAddingOn(dateKey)}
                      aria-label={`Add a time slot on ${formatDateKey(dateKey, LONG_DATE)}`}
                      className="hidden h-6 w-6 items-center justify-center rounded text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {daySlots.length > 0 && (
                  <>
                    <ul className="mt-1 hidden space-y-1 sm:block">
                      {daySlots.slice(0, CHIPS_PER_DAY).map((slot) => {
                        const list = bookings[slot.id] ?? [];
                        return (
                          <li key={slot.id}>
                            <button
                              type="button"
                              onClick={() => setOpenSlot(slot)}
                              title={
                                list.length
                                  ? [...list.map((b) => `${b.firm}: ${b.caseTitle}`), slotHoursLine(slot, list)].join(" / ")
                                  : (slot.note ?? undefined)
                              }
                              className={cn(
                                "w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80",
                                list.length
                                  ? BOOKING_STATE_CLASSES[slotState(list)]
                                  : isPast
                                    ? "bg-slate-100 text-slate-500"
                                    : BOOKING_STATE_CLASSES.open
                              )}
                            >
                              <span className="block truncate">{formatSlotRange(slot)}</span>
                              {list.length > 0 && (
                                <span className="block truncate text-[10px] font-normal">
                                  {list.length === 1 ? list[0].firm : `${list.length} firms`}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                      {daySlots.length > CHIPS_PER_DAY && (
                        <li className="px-1.5 text-[11px] text-slate-500">
                          +{daySlots.length - CHIPS_PER_DAY} more
                        </li>
                      )}
                    </ul>

                    {/* Phones get a dot per slot; the list below has the times. */}
                    <div className="mt-1 flex flex-wrap gap-0.5 px-1 sm:hidden" aria-hidden="true">
                      {daySlots.slice(0, 4).map((slot) => (
                        <span
                          key={slot.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            bookings[slot.id]?.length ? "bg-amber-500" : isPast ? "bg-slate-300" : "bg-blue-500"
                          )}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ================= THE MONTH'S SLOTS ================= */}
      <Card>
        <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <h3 className="text-base font-semibold text-slate-800">Slots in {formatMonthKey(monthKey)}</h3>
          <span className="text-sm text-slate-500">
            {monthSlotCount} slot{monthSlotCount === 1 ? "" : "s"}
          </span>
        </div>

        {datesWithSlots.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6">
            No time slots this month yet. Use <strong>Add Time Slots</strong> to open some.
          </p>
        ) : (
          <ul className="divide-y">
            {datesWithSlots.map((dateKey) => (
              <li key={dateKey} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6 sm:px-6">
                <p
                  className={cn(
                    "w-28 shrink-0 pt-1.5 text-sm font-semibold",
                    dateKey < todayKey ? "text-slate-400" : "text-slate-700"
                  )}
                >
                  {formatDateKey(dateKey)}
                </p>
                <ul className="flex-1 space-y-1">
                  {(slotsByDate.get(dateKey) ?? []).map((slot) => {
                    const list = bookings[slot.id] ?? [];
                    return (
                      <li key={slot.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0 text-sm">
                          <p>
                            <span className="font-medium text-slate-800">
                              {formatSlotRange(slot)} {SLOT_TIME_ZONE_LABEL}
                            </span>
                            {slot.note && <span className="text-slate-500"> · {slot.note}</span>}
                            {list.length > 0 && <span className="text-slate-500"> · {slotHoursLine(slot, list)}</span>}
                          </p>
                          {list.map((booking) => (
                            <p key={booking.caseId} className="mt-0.5 flex flex-wrap items-center gap-2 text-slate-600">
                              <BookingStateBadge state={booking.state} />
                              <span>{booking.firm}</span>
                              <span className="text-slate-400">·</span>
                              <Link href={`/dashboard/Admin/${booking.caseId}`} className="text-blue-700 hover:underline">
                                {booking.caseTitle}
                              </Link>
                              <span className="text-slate-400">· {formatMinutes(booking.minutes)}</span>
                              {booking.session && (
                                <span className={booking.session.outsideSlot ? "text-amber-700" : "text-green-700"}>
                                  · {booking.session.outsideSlot ? "in a session outside this slot" : "in session"}
                                </span>
                              )}
                            </p>
                          ))}
                        </div>
                        {list.length ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => setOpenSlot(slot)}>
                            Manage
                          </Button>
                        ) : (
                          <DeleteSlotButton slotId={slot.id} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {addingOn && (
        <AddTimeSlotsDialog initialDate={addingOn} onClose={() => setAddingOn(null)} onCreated={handleCreated} />
      )}

      {openSlot && (
        <TimeSlotModal
          title={formatDateKey(slotDateKey(openSlot.starts_at), { ...LONG_DATE, year: "numeric" })}
          onClose={() => setOpenSlot(null)}
        >
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</dt>
              <dd className="mt-0.5 text-slate-800">
                {formatSlotRange(openSlot)} {SLOT_TIME_ZONE_LABEL}
              </dd>
            </div>
            {openSlot.note && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</dt>
                <dd className="mt-0.5 break-words text-slate-800">{openSlot.note}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours</dt>
              <dd className="mt-0.5 text-slate-800">{slotHoursLine(openSlot, bookings[openSlot.id] ?? [])}</dd>
            </div>
          </dl>

          {bookings[openSlot.id]?.length ? (
            <div className="space-y-4 border-t pt-4">
              {bookings[openSlot.id].map((booking) => (
                <div key={booking.caseId} className="space-y-3 rounded-lg border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {formatMinutes(booking.minutes)}
                  </p>
                  <BookingSummary booking={booking} />
                  <SessionLine booking={booking} />
                  <BookingAdminControls booking={booking} openSlots={openSlots} />
                </div>
              ))}
              <BuildSessionLink slot={openSlot} list={bookings[openSlot.id]} />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setOpenSlot(null)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <DeleteSlotButton slotId={openSlot.id} onDeleted={() => setOpenSlot(null)} />
              <Button variant="outline" onClick={() => setOpenSlot(null)}>
                Close
              </Button>
            </div>
          )}
        </TimeSlotModal>
      )}
    </div>
  );
}

/** Delete, then "Delete this slot? Yes, delete / Keep", so one stray click can't remove a slot. */
function DeleteSlotButton({ slotId, onDeleted }: { slotId: string; onDeleted?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function confirmDelete() {
    setError(null);
    startDeleting(async () => {
      try {
        const result = await deleteRequesteeTimeSlot(slotId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDeleted?.();
        router.refresh();
      } catch (err) {
        console.error("[TimeSlotCalendar] delete failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 />
        Delete
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Delete this slot?</span>
      <Button type="button" size="sm" variant="destructive" onClick={confirmDelete} disabled={deleting}>
        {deleting ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>
        Keep
      </Button>
      {error && (
        <p role="alert" className="basis-full text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
