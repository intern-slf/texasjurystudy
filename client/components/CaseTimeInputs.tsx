"use client";

import { useState, useRef, useEffect } from "react";

// All 24 hours displayed in a 6-column grid — no scroll needed
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

type TimeVal = { h: string; m: string };
type Props = { caseId: string };

function addOneHour({ h, m }: TimeVal): TimeVal {
  return { h: String((parseInt(h) + 1) % 24).padStart(2, "0"), m };
}

/* ── Reusable dropdown picker ──────────────────────────────── */
function PickerDropdown({
  label,
  items,
  selected,
  onSelect,
  gridCols,       // Tailwind grid-cols class e.g. "grid-cols-6"
  width,          // dropdown width class e.g. "w-52"
}: {
  label: string;
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
  gridCols: string;
  width: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-10 text-center py-1 bg-white text-slate-700 font-mono text-sm hover:bg-slate-50 focus:outline-none"
      >
        {selected || label}
      </button>

      {open && (
        <div className={`absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden ${width}`}>
          <div className="text-[10px] text-center font-semibold text-slate-400 py-1 bg-slate-50 border-b border-slate-100">
            {label}
          </div>
          <div className={`${gridCols === "grid-cols-1" && items.length > 6 ? "flex flex-col overflow-y-auto max-h-52" : "flex flex-col"} p-1 gap-0`}>
            {items.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className={`py-1.5 text-sm font-mono text-center rounded transition-colors ${
                  selected === item
                    ? "bg-slate-800 text-white font-bold"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Single time picker (HR + MIN) ────────────────────────── */
function TimePicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TimeVal;
  onChange: (v: TimeVal) => void;
}) {
  return (
    <div className="flex items-center border border-slate-200 rounded bg-white overflow-visible text-sm font-mono">
      {/* hidden input for form submission */}
      <input
        type="hidden"
        name={name}
        value={value.h && value.m ? `${value.h}:${value.m}` : ""}
        required
      />

      {/* Hours — grid dropdown (6 cols × 4 rows, no scroll) */}
      <PickerDropdown
        label="HH"
        items={HOURS}
        selected={value.h}
        onSelect={(h) => onChange({ h, m: value.m || "00" })}
        gridCols="grid-cols-1"
        width="w-20"
      />

      <span className="text-slate-400 select-none px-0.5">:</span>

      {/* Minutes — 4 options, no scroll */}
      <PickerDropdown
        label="MM"
        items={MINUTES}
        selected={value.m}
        onSelect={(m) => onChange({ ...value, m })}
        gridCols="grid-cols-1"
        width="w-20"
      />
    </div>
  );
}

/* ── Exported wrapper ──────────────────────────────────────── */
export default function CaseTimeInputs({ caseId }: Props) {
  const [start, setStart] = useState<TimeVal>({ h: "", m: "" });
  const [end, setEnd] = useState<TimeVal>({ h: "", m: "" });

  function handleStart(v: TimeVal) {
    setStart(v);
    if (v.h && v.m) setEnd(addOneHour(v));
  }

  return (
    <div className="flex items-center gap-3 mt-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
      <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wide mr-auto">
        Time
      </span>
      <TimePicker name={`start_${caseId}`} value={start} onChange={handleStart} />
      <span className="text-slate-300">→</span>
      <TimePicker name={`end_${caseId}`} value={end} onChange={setEnd} />
    </div>
  );
}
