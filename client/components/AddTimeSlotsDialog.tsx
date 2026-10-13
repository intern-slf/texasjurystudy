"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TimeSlotModal from "@/components/TimeSlotModal";
import { createRequesteeTimeSlots } from "@/lib/actions/requesteeTimeSlots";
import {
  SLOT_MAX_WEEKS,
  SLOT_NOTE_MAX_LENGTH,
  SLOT_TIME_OPTIONS,
  SLOT_TIME_ZONE_LABEL,
  addDays,
  formatClockTime,
  formatDateKey,
  isDateKey,
  slotDateKey,
} from "@/lib/requesteeTimeSlots";

const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

const DEFAULT_START = "10:00";
const DEFAULT_END = "12:00";
// A slot ends after it starts, so the last half hour of the day can only be an end.
const START_OPTIONS = SLOT_TIME_OPTIONS.slice(0, -1);
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

type Props = {
  /** The date the form opens on, "YYYY-MM-DD". */
  initialDate: string;
  onClose: () => void;
  /** Called once the slots are saved, with how many there were and the first date. */
  onCreated: (created: number, firstDate: string) => void;
};

export default function AddTimeSlotsDialog({ initialDate, onClose, onCreated }: Props) {
  const [today] = useState(() => slotDateKey(Date.now()));
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [weeks, setWeeks] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const validDate = isDateKey(date);
  const weekday = validDate ? formatDateKey(date, { weekday: "long" }) : "week";
  const timeRange = `${formatClockTime(start)} – ${formatClockTime(end)} ${SLOT_TIME_ZONE_LABEL}`;

  function changeStart(value: string) {
    setStart(value);
    // A start at or after the end leaves no valid end, so move the end to two
    // hours after the new start, or as late as the day allows.
    if (end <= value) {
      const index = SLOT_TIME_OPTIONS.indexOf(value);
      setEnd(SLOT_TIME_OPTIONS[Math.min(index + 4, SLOT_TIME_OPTIONS.length - 1)]);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      try {
        const result = await createRequesteeTimeSlots({ date, start, end, weeks, note });
        if (result.ok) onCreated(result.created, date);
        else setError(result.error);
      } catch (err) {
        console.error("[AddTimeSlotsDialog] save failed:", err);
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }

  return (
    <TimeSlotModal
      title="Add time slots"
      description="Law firms will be able to book these times for an online focus group. All times are Central Time."
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="slot-date">Date</Label>
          <Input
            id="slot-date"
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="slot-start">Starts ({SLOT_TIME_ZONE_LABEL})</Label>
            <select
              id="slot-start"
              value={start}
              onChange={(e) => changeStart(e.target.value)}
              className={SELECT_CLASSES}
            >
              {START_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {formatClockTime(time)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-end">Ends ({SLOT_TIME_ZONE_LABEL})</Label>
            <select
              id="slot-end"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={SELECT_CLASSES}
            >
              {SLOT_TIME_OPTIONS.filter((time) => time > start).map((time) => (
                <option key={time} value={time}>
                  {formatClockTime(time)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slot-repeat">Repeat</Label>
          <select
            id="slot-repeat"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className={SELECT_CLASSES}
          >
            <option value={1}>Doesn&apos;t repeat</option>
            {Array.from({ length: SLOT_MAX_WEEKS - 1 }, (_, i) => i + 2).map((count) => (
              <option key={count} value={count}>
                Every {weekday} for {count} weeks
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slot-note">
            Note <span className="font-normal text-slate-400">(optional, firms will see it)</span>
          </Label>
          <Input
            id="slot-note"
            value={note}
            maxLength={SLOT_NOTE_MAX_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Morning session"
            className="bg-white"
          />
        </div>

        {validDate && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {weeks === 1 ? (
              <>
                Adds one slot on <strong>{formatDateKey(date)}</strong>, {timeRange}.
              </>
            ) : (
              <>
                Adds {weeks} slots, every {weekday} from{" "}
                <strong>{formatDateKey(date, SHORT_DATE)}</strong> to{" "}
                <strong>{formatDateKey(addDays(date, 7 * (weeks - 1)), SHORT_DATE)}</strong>, {timeRange}.
              </>
            )}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !validDate}>
            {saving ? "Adding…" : weeks === 1 ? "Add slot" : `Add ${weeks} slots`}
          </Button>
        </div>
      </form>
    </TimeSlotModal>
  );
}
