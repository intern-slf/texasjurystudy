"use client";

import { useState, useTransition } from "react";
import { updateCaseFilters } from "@/app/dashboard/presenter/actions/updateCaseFilters";
import { CaseFilters } from "@/lib/filter-utils";

const EDUCATION_LEVELS = [
  "Less than High School",
  "High School or GED",
  "Associate's or Technical Degree",
  "Some College",
  "Bachelor Degree",
  "Graduate Degree",
];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
  "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

function applyEducationAutoSelect(option: string, current: string[]): string[] {
  const idx = EDUCATION_LEVELS.indexOf(option);
  const isSelected = current.includes(option);
  if (isSelected) {
    const toRemove = new Set(EDUCATION_LEVELS.slice(idx));
    return current.filter((v) => !toRemove.has(v));
  } else {
    const toAdd = EDUCATION_LEVELS.slice(idx);
    return Array.from(new Set([...current, ...toAdd]));
  }
}

function MultiCheckbox({
  label, options, values, onChange,
}: {
  label: string; options: string[]; values: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2 py-1 rounded-md border select-none ${values.length === 0 ? "bg-slate-800 text-white border-slate-800 font-semibold" : "bg-card text-muted-foreground border-slate-200"}`}>
          No Preference
        </span>
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer border px-2 py-1 rounded-md bg-card hover:bg-accent transition-colors">
            <input
              type="checkbox"
              checked={values.includes(opt)}
              onChange={() => onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt])}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

function YesNoSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <select className="w-full border rounded px-3 py-2 text-sm bg-white" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No Preference</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  );
}

type Props = {
  caseId: string;
  initialFilters: CaseFilters | null;
  /** If true, case is scheduled — editing is locked */
  locked: boolean;
};

export default function CaseFilterEditor({ caseId, initialFilters, locked }: Props) {
  const f = initialFilters ?? {};

  const [filters, setFilters] = useState({
    age: { min: String(f.age?.min ?? ""), max: String(f.age?.max ?? "") },
    gender: f.gender ?? [],
    race: f.race ?? [],
    location: { state: f.location?.state ?? [] },
    political_affiliation: f.political_affiliation ?? [],
    eligibility: {
      served_on_jury: f.eligibility?.served_on_jury ?? "",
      has_children: f.eligibility?.has_children ?? "",
      served_armed_forces: f.eligibility?.served_armed_forces ?? "",
      currently_employed: f.eligibility?.currently_employed ?? "",
    },
    socioeconomic: {
      marital_status: f.socioeconomic?.marital_status ?? [],
      education_level: f.socioeconomic?.education_level ?? [],
      family_income: f.socioeconomic?.family_income ?? [],
      availability: f.socioeconomic?.availability ?? [],
    },
  });

  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const payload = {
      age: {
        min: filters.age.min ? Number(filters.age.min) : 18,
        max: filters.age.max ? Number(filters.age.max) : 99,
      },
      gender: filters.gender,
      race: filters.race,
      location: { state: filters.location.state },
      political_affiliation: filters.political_affiliation,
      eligibility: {
        served_on_jury: filters.eligibility.served_on_jury || "Any",
        has_children: filters.eligibility.has_children || "Any",
        served_armed_forces: filters.eligibility.served_armed_forces || "Any",
        currently_employed: filters.eligibility.currently_employed || "Any",
      },
      socioeconomic: {
        marital_status: filters.socioeconomic.marital_status,
        education_level: filters.socioeconomic.education_level,
        family_income: filters.socioeconomic.family_income,
        availability: filters.socioeconomic.availability,
      },
    };

    startTransition(async () => {
      await updateCaseFilters(caseId, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  if (locked) {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
        <span>🔒</span>
        <span>Participant filters are <strong>locked</strong> — a session has been scheduled for this case.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* COLUMN 1 — Location & Political */}
        <div className="space-y-5">
          <div className="bg-card p-5 rounded-xl border space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Location</h4>
            <div className="max-h-48 overflow-y-auto">
              <MultiCheckbox label="" options={US_STATES} values={filters.location.state}
                onChange={(v) => { setFilters({ ...filters, location: { state: v } }); setSaved(false); }} />
            </div>
          </div>

          <div className="bg-card p-5 rounded-xl border space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Political Context</h4>
            <MultiCheckbox label="Political Affiliation" options={["Republican", "Democrat", "Other"]}
              values={filters.political_affiliation}
              onChange={(v) => { setFilters({ ...filters, political_affiliation: v }); setSaved(false); }} />
          </div>
        </div>

        {/* COLUMN 2 — Demographics & Eligibility */}
        <div className="space-y-5">
          <div className="bg-card p-5 rounded-xl border space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Age & Identity</h4>
            <div className="flex gap-3">
              <input type="number" className="border rounded px-3 py-2 text-sm flex-1" placeholder="Min Age"
                value={filters.age.min}
                onChange={(e) => { setFilters({ ...filters, age: { ...filters.age, min: e.target.value } }); setSaved(false); }} />
              <input type="number" className="border rounded px-3 py-2 text-sm flex-1" placeholder="Max Age"
                value={filters.age.max}
                onChange={(e) => { setFilters({ ...filters, age: { ...filters.age, max: e.target.value } }); setSaved(false); }} />
            </div>
            <MultiCheckbox label="Gender" options={["Male", "Female", "Other"]} values={filters.gender}
              onChange={(v) => { setFilters({ ...filters, gender: v }); setSaved(false); }} />
            <MultiCheckbox label="Race"
              options={["Caucasian", "African American", "Asian", "Native American", "Middle Eastern", "Latino/Hispanic", "Multi-racial", "Other"]}
              values={filters.race}
              onChange={(v) => { setFilters({ ...filters, race: v }); setSaved(false); }} />
          </div>

          <div className="bg-card p-5 rounded-xl border space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Eligibility & Status</h4>
            <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury}
              onChange={(v) => { setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } }); setSaved(false); }} />
            <YesNoSelect label="Has children?" value={filters.eligibility.has_children}
              onChange={(v) => { setFilters({ ...filters, eligibility: { ...filters.eligibility, has_children: v } }); setSaved(false); }} />
            <YesNoSelect label="Currently employed?" value={filters.eligibility.currently_employed}
              onChange={(v) => { setFilters({ ...filters, eligibility: { ...filters.eligibility, currently_employed: v } }); setSaved(false); }} />
          </div>
        </div>

        {/* COLUMN 3 — Socioeconomic */}
        <div className="space-y-5">
          <div className="bg-card p-5 rounded-xl border space-y-4">
            <h4 className="font-semibold text-sm border-b pb-2">Socioeconomic Factors</h4>
            <MultiCheckbox label="Marital Status"
              options={["Single / Never Married", "Married", "Divorced", "Separated", "Widowed"]}
              values={filters.socioeconomic.marital_status}
              onChange={(v) => { setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, marital_status: v } }); setSaved(false); }} />
            <MultiCheckbox label="Education Level" options={EDUCATION_LEVELS}
              values={filters.socioeconomic.education_level}
              onChange={(newVals) => {
                const current = filters.socioeconomic.education_level;
                const toggled = newVals.length > current.length
                  ? newVals.find((v) => !current.includes(v))!
                  : current.find((v) => !newVals.includes(v))!;
                setFilters((prev) => ({
                  ...prev,
                  socioeconomic: { ...prev.socioeconomic, education_level: applyEducationAutoSelect(toggled, current) },
                }));
                setSaved(false);
              }} />
            <MultiCheckbox label="Family Income"
              options={["less than $40K", "$41-75K", "$75-100K", "$101-$150K", "$150K+"]}
              values={filters.socioeconomic.family_income}
              onChange={(v) => { setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, family_income: v } }); setSaved(false); }} />
          </div>
        </div>

      </div>

      {/* SAVE */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || saved}
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          {saved ? "Saved ✓" : pending ? "Saving…" : "Save Filters"}
        </button>
        {saved && <span className="text-sm text-green-600">Filters updated successfully.</span>}
      </div>
    </div>
  );
}
