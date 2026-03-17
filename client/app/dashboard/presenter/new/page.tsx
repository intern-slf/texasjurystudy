"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";

const EDUCATION_LEVELS = [
  "Less than High School",
  "High School or GED",
  "Associate's or Technical Degree",
  "Some College",
  "Bachelor Degree",
  "Graduate Degree",
];

function applyEducationAutoSelect(option: string, current: string[]): string[] {
  const idx = EDUCATION_LEVELS.indexOf(option);
  const isSelected = current.includes(option);
  if (isSelected) {
    // Uncheck: remove this level and all above it
    const toRemove = new Set(EDUCATION_LEVELS.slice(idx));
    return current.filter((v) => !toRemove.has(v));
  } else {
    // Check: add this level and all above it
    const toAdd = EDUCATION_LEVELS.slice(idx);
    return Array.from(new Set([...current, ...toAdd]));
  }
}

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


const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

function HourPicker({ value, onChange }: { value: string; onChange: (h: string) => void }) {
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
        className="flex items-center gap-1 border border-slate-200 rounded bg-white px-3 py-2 text-sm font-mono text-slate-700 hover:bg-slate-50 focus:outline-none w-24"
      >
        {value || "HH"}:00
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden w-24">
          <div className="text-[10px] text-center font-semibold text-slate-400 py-1 bg-slate-50 border-b border-slate-100">Hour</div>
          <div className="flex flex-col overflow-y-auto max-h-52 p-1 gap-0">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => { onChange(h); setOpen(false); }}
                className={`py-1.5 text-sm font-mono text-center rounded transition-colors ${
                  value === h ? "bg-slate-800 text-white font-bold" : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                {h}:00
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getAvailabilityFromDate(dateStr: string): string[] {
  if (!dateStr) return [];
  const day = new Date(dateStr).getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6 ? ["Weekends"] : ["Weekdays"];
}

export default function NewCasePage() {
  const supabase = createClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    number_of_attendees: 10,
    documentation_type: "Legal Brief", // Default to prevent null constraint error
    scheduled_at: "",
    deadline_date: "",
  });

  const [filters, setFilters] = useState({
    age: { min: "", max: "" },
    gender: [] as string[],
    race: [] as string[],
    location: { state: [] as string[] },
    eligibility: {
      served_on_jury: "",
      has_children: "",
      served_armed_forces: "",
      currently_employed: "",
    },
    socioeconomic: {
      marital_status: [] as string[],
      education_level: [] as string[],
      family_income: [] as string[],
      availability: [] as string[],
    },
    political_affiliation: [] as string[],
  });

  const [caseId, setCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchParams = useSearchParams();
  const parentId = searchParams.get("parent_id");

  useEffect(() => {
    if (parentId) {
      const fetchParent = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from("cases")
          .select("*")
          .eq("id", parentId)
          .single();

        if (data && !error) {
          setForm({
            title: `Follow-up: ${data.title}`,
            description: data.description,
            number_of_attendees: data.number_of_attendees || 10,
            documentation_type: data.documentation_type || "Legal Brief",
            scheduled_at: "", // Don't pre-fill date
            deadline_date: "", // Don't pre-fill deadline
          });
          if (data.filters) {
            setFilters({
              ...data.filters,
              socioeconomic: {
                ...data.filters.socioeconomic,
                availability: [], // cleared — will be recalculated when date is set
              },
            });
          }
        }
        setLoading(false);
      };
      fetchParent();
    }
  }, [parentId]);

  async function createCaseAndUpload() {
    if (!form.title.trim()) {
      alert("Please provide a title.");
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      alert("Session expired.");
      setLoading(false);
      return;
    }

    const softFilterPayload = {
      age: {
        min: filters.age.min ? Number(filters.age.min) : 18,
        max: filters.age.max ? Number(filters.age.max) : 99,
      },
      gender: filters.gender,
      race: filters.race,
      location: { state: filters.location.state },
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
      political_affiliation: filters.political_affiliation,
    };

    const { data, error } = await supabase
      .from("cases")
      .insert({
        user_id: user.id,
        title: form.title,
        description: form.description,
        number_of_attendees: form.number_of_attendees,
        documentation_type: form.documentation_type, // Now explicitly handled
        status: "current",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        deadline_date: form.deadline_date ? new Date(form.deadline_date).toISOString() : null,
        filters: softFilterPayload,
        parent_case_id: parentId || null,
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setCaseId(data.id);
    setLoading(false);
  }

  function YesNoSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void; }) {
    return (
      <div className="flex flex-col space-y-1">
        <label className="text-sm font-medium">{label}</label>
        <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No Preference</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
    );
  }

  function MultiCheckbox({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void; }) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer border px-2 py-1 rounded-md bg-card hover:bg-accent transition-colors">
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

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <PresenterSidebar />
      <section className="flex-1 max-w-6xl px-8 py-12 space-y-10 overflow-y-auto">
        <header>
          <h1 className="text-4xl font-extrabold tracking-tight">New Case Setup</h1>
          <p className="text-muted-foreground mt-2">Provide case context and set juror ranking priorities.</p>
        </header>

        {!caseId ? (
          <div className="space-y-8">

            {/* Case Details — always visible */}
            <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4 max-w-2xl">
              <label className="text-sm font-bold uppercase tracking-wider text-primary">Case Details</label>
              <input className="input w-full" placeholder="Case Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="input w-full" rows={2} placeholder="Brief Case Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="space-y-2">
                <label className="text-sm font-medium">Deadline Date</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="border rounded px-3 py-2 text-sm flex-1"
                    value={form.deadline_date ? form.deadline_date.slice(0, 10) : ""}
                    onChange={(e) => {
                      const hour = form.deadline_date ? form.deadline_date.slice(11, 13) : "00";
                      const val = e.target.value ? `${e.target.value}T${hour}:00` : "";
                      setForm({ ...form, deadline_date: val });
                    }}
                  />
                  <HourPicker
                    value={form.deadline_date ? form.deadline_date.slice(11, 13) : ""}
                    onChange={(h) => {
                      const date = form.deadline_date ? form.deadline_date.slice(0, 10) : "";
                      const val = date ? `${date}T${h}:00` : "";
                      setForm({ ...form, deadline_date: val });
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Number of Attendees</label>
                <input type="number" className="input w-full" placeholder="10" value={form.number_of_attendees} onChange={(e) => setForm({ ...form, number_of_attendees: Number(e.target.value) })} />
              </div>
            </div>

            {/* Toggle button */}
            <button
              type="button"
              onClick={() => {
                if (showFilters) {
                  // Switching to "No Filters" — clear all filters
                  setFilters({
                    age: { min: "", max: "" },
                    gender: [],
                    race: [],
                    location: { state: [] },
                    eligibility: {
                      served_on_jury: "",
                      has_children: "",
                      served_armed_forces: "",
                      currently_employed: "",
                    },
                    socioeconomic: {
                      marital_status: [],
                      education_level: [],
                      family_income: [],
                      availability: [],
                    },
                    political_affiliation: [],
                  });
                }
                setShowFilters((v) => {
                  if (!v) {
                    setTimeout(() => window.scrollBy({ top: 400, behavior: "smooth" }), 50);
                  }
                  return !v;
                });
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-primary text-primary font-semibold text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {showFilters ? (
                <>
                  <span>&#8593;</span> No Filters
                </>
              ) : (
                <>
                  <span>&#8595;</span> Apply Filters
                </>
              )}
            </button>

            {/* All filters — shown when toggled */}
            {showFilters && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMN 1 — Preferable Date + Location */}
                <div className="space-y-6 self-start">
                  <div className="space-y-4 bg-card p-6 rounded-2xl border shadow-sm">
                    <label className="text-sm font-bold uppercase tracking-wider text-primary">Scheduling</label>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Preferable Date</label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          className="border rounded px-3 py-2 text-sm flex-1"
                          value={form.scheduled_at ? form.scheduled_at.slice(0, 10) : ""}
                          onChange={(e) => {
                            const hour = form.scheduled_at ? form.scheduled_at.slice(11, 13) : "00";
                            const val = e.target.value ? `${e.target.value}T${hour}:00` : "";
                            setForm({ ...form, scheduled_at: val });
                            setFilters((f) => ({ ...f, socioeconomic: { ...f.socioeconomic, availability: getAvailabilityFromDate(val) } }));
                          }}
                        />
                        <HourPicker
                          value={form.scheduled_at ? form.scheduled_at.slice(11, 13) : ""}
                          onChange={(h) => {
                            const date = form.scheduled_at ? form.scheduled_at.slice(0, 10) : "";
                            const val = date ? `${date}T${h}:00` : "";
                            setForm({ ...form, scheduled_at: val });
                            setFilters((f) => ({ ...f, socioeconomic: { ...f.socioeconomic, availability: getAvailabilityFromDate(val) } }));
                          }}
                        />
                      </div>
                      {filters.socioeconomic.availability.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Availability filter auto-set to{" "}
                          <span className="font-semibold text-primary">
                            {filters.socioeconomic.availability[0]}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Location</h3>
                    <div className="max-h-48 overflow-y-auto">
                      <MultiCheckbox label="" options={US_STATES} values={filters.location.state} onChange={(v) => setFilters({ ...filters, location: { state: v } })} />
                    </div>
                  </div>

                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Political Context</h3>
                    <MultiCheckbox label="Political Affiliation" options={["Republican", "Democrat", "Other"]} values={filters.political_affiliation} onChange={(v) => setFilters({ ...filters, political_affiliation: v })} />
                  </div>
                </div>

                {/* COLUMN 2 — Demographics & Eligibility */}
                <div className="space-y-6">
                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Age & Identity</h3>
                    <div className="flex gap-4">
                      <input type="number" className="input flex-1" placeholder="Min Age" value={filters.age.min} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, min: e.target.value } })} />
                      <input type="number" className="input flex-1" placeholder="Max Age" value={filters.age.max} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, max: e.target.value } })} />
                    </div>
                    <MultiCheckbox label="Gender" options={["Male", "Female", "Other"]} values={filters.gender} onChange={(v) => setFilters({ ...filters, gender: v })} />
                    <MultiCheckbox label="Race" options={["Caucasian", "African American", "Asian", "Native American", "Middle Eastern", "Latino/Hispanic", "Multi-racial", "Other"]} values={filters.race} onChange={(v) => setFilters({ ...filters, race: v })} />
                  </div>

                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Eligibility & Status</h3>
                    <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } })} />
                    <YesNoSelect label="Has children?" value={filters.eligibility.has_children} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, has_children: v } })} />
                    <YesNoSelect label="Currently employed?" value={filters.eligibility.currently_employed} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, currently_employed: v } })} />
                  </div>
                </div>

                {/* COLUMN 3 — Socioeconomic & Political */}
                <div className="space-y-6">
                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Socioeconomic Factors</h3>
                    <MultiCheckbox label="Marital Status" options={["Single / Never Married", "Married", "Divorced", "Separated", "Widowed"]} values={filters.socioeconomic.marital_status} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, marital_status: v } })} />
                    <MultiCheckbox label="Education Level" options={EDUCATION_LEVELS} values={filters.socioeconomic.education_level} onChange={(newVals) => setFilters((f) => {
                        const current = f.socioeconomic.education_level;
                        const toggled = newVals.length > current.length
                          ? newVals.find((v) => !current.includes(v))!
                          : current.find((v) => !newVals.includes(v))!;
                        return { ...f, socioeconomic: { ...f.socioeconomic, education_level: applyEducationAutoSelect(toggled, current) } };
                      })} />
                    <MultiCheckbox label="Family Income" options={["less than $40K", "$41-75K", "$75-100K", "$101-$150K", "$150K+"]} values={filters.socioeconomic.family_income} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, family_income: v } })} />
                  </div>

                </div>

              </div>
            )}

            {/* SAVE BUTTON */}
            <button onClick={createCaseAndUpload} disabled={loading} className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
              {loading ? "Establishing Case..." : "Save Case & Filter"}
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6 text-center animate-in zoom-in-95 duration-500">
            <div className="p-10 bg-green-500/5 border border-green-500/20 rounded-[32px]">
              <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-bold">✓</div>
              <h2 className="text-3xl font-bold text-green-700">Case Ranking Profile Saved</h2>
              <p className="text-green-600 mt-2 text-lg">Your attributes are matched. Please upload the required documents to start finding participants.</p>
            </div>
            <CaseDocumentUploader caseId={caseId} />
            <button onClick={() => window.location.href = "/dashboard/presenter"} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors underline decoration-2 underline-offset-8">
              Back to Presenter Dashboard
            </button>
          </div>
        )}
      </section>
    </main>
  );
}