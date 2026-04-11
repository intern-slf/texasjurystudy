"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";
import ReceiptPricingPreview from "@/components/ReceiptPricingPreview";
import { TEXAS_COUNTIES } from "@/lib/constants/texas-counties";
import { CaseFilters } from "@/lib/filter-utils";
import { ChevronDown, ChevronUp, Play } from "lucide-react";

const FOCUS_GROUP_VIDEOS = {
  general: {
    title: "What Texas Jury Study Will Provide After Concluding the Focus Group",
    url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Narrative%204%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvTmFycmF0aXZlIDQgKDEpLm1wNCIsImlhdCI6MTc3NTkzMTQxNiwiZXhwIjoxODA3NDY3NDE2fQ.V5TX3a81LCFPujYirxP_-lOkxo-fT-hVg7uX41L8C6w`,
  },
  narrative: [
    {
      question: "What is the purpose of a narrative focus group?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Narrative%201%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvTmFycmF0aXZlIDEgKDEpLm1wNCIsImlhdCI6MTc3NTkyODk2MywiZXhwIjoxODA3NDY0OTYzfQ.38oar91Ne4_daFGROJqyrUNxC7uVitz7_Po7Cnpf2Ac`,
    },
    {
      question: "At what phase of the case could one conduct a narrative focus group?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Narrative%202%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvTmFycmF0aXZlIDIgKDEpLm1wNCIsImlhdCI6MTc3NTkzMjUzNSwiZXhwIjoxODA3NDY4NTM1fQ.aiB_AWhxXDoIf-FimutPO3m62t_Byhmk02WPu96xos8`,
    },
    {
      question: "What materials are required to submit a case for a narrative focus group?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Narrative%203%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvTmFycmF0aXZlIDMgKDEpLm1wNCIsImlhdCI6MTc3NTkzMTUzNiwiZXhwIjoxODA3NDY3NTM2fQ.gVgjbYsoFsdZ1AEcxHzg1zsJf4rEZfvVx478AylSHaI`,
    },
  ],
  openingStatement: [
    {
      question: "How is an opening statement focus group conducted and what is the ideal timeframe for holding one?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Opening%20statement%201_1%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvT3BlbmluZyBzdGF0ZW1lbnQgMV8xICgxKS5tcDQiLCJpYXQiOjE3NzU5MzE5NDIsImV4cCI6MTgwNzQ2Nzk0Mn0.0fD5QaLaWZM-5hkTgyFkpcURK7J88j_vqrtnfbZZl4w`,
    },
    {
      question: "How does the opening statement focus group work?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Opening%20Statement%202%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvT3BlbmluZyBTdGF0ZW1lbnQgMiAoMSkubXA0IiwiaWF0IjoxNzc1OTMyMTg2LCJleHAiOjE4MDc0NjgxODZ9.m-ZniHq6pzC4iegyskPrAWfBcWCMgjXCjzw056PSaqI`,
    },
    {
      question: "What is the best way to organize opening statement focus groups, and who presents which side?",
      url: `https://ddjfkgxwqtwmuhuecldq.supabase.co/storage/v1/object/sign/videos/Opening%20Statement%203%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV81N2JhNDRiMi1mZjg2LTQyYmItYTk1YS1jODVkYTVlMTljZTYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvT3BlbmluZyBTdGF0ZW1lbnQgMyAoMSkubXA0IiwiaWF0IjoxNzc1OTMyMzY0LCJleHAiOjE4MDc0NjgzNjR9.wDP0imxW3fCFgN44BhUfHcNkBiFNaR_Jfc52MYI96wg`,
    },
  ],
};

function VideoPlayer({ url, className = "" }: { url: string; className?: string }) {
  if (!url) {
    return (
      <div className={`aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center ${className}`}>
        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
          <Play className="w-6 h-6 text-white/60 ml-0.5" />
        </div>
        <span className="text-xs text-white/40 font-medium">Video Pending</span>
      </div>
    );
  }
  return (
    <video
      src={url}
      controls
      controlsList="nodownload"
      className={`aspect-video bg-slate-900 rounded-xl w-full object-cover ${className}`}
    />
  );
}

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
    drive_link: "",
    case_type: "",
    hours_requested: "1",
    focus_group_type: "",
    county: "",
    participants_from_county: "",

    documentation_type: "Legal Brief", // Default to prevent null constraint error
    scheduled_at: "",
    session_completion_timeframe: "",
    preferred_day: "",
  });

  const [filters, setFilters] = useState({
    gender: [] as string[],
    race: [] as string[],
    age: { min: "", max: "" },
    location: { state: [] as string[], county: [] as string[] },
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
  const [driveLink, setDriveLink] = useState("");
  const [driveLinkSaved, setDriveLinkSaved] = useState(false);
  const [driveLinkSaving, setDriveLinkSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openVideoFaq, setOpenVideoFaq] = useState<number | null>(null);
  const [countyQuery, setCountyQuery] = useState("");
  const [showCountySuggestions, setShowCountySuggestions] = useState(false);
  const countyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (countyRef.current && !countyRef.current.contains(e.target as Node)) setShowCountySuggestions(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
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
            drive_link: data.drive_link || "",
            case_type: data.case_type || "",
            hours_requested: data.hours_requested ? String(data.hours_requested) : "",
            focus_group_type: data.focus_group_type || "",
            county: data.county || "",
            participants_from_county: data.participants_from_county || "",

            documentation_type: data.documentation_type || "Legal Brief",
            scheduled_at: "", // Don't pre-fill date
            session_completion_timeframe: "",
            preferred_day: "",
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

  async function saveDriveLink() {
    if (!caseId || !driveLink.trim()) return;
    setDriveLinkSaving(true);
    await supabase.from("cases").update({ drive_link: driveLink.trim() }).eq("id", caseId);
    setDriveLinkSaved(true);
    setDriveLinkSaving(false);
  }

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
      gender: filters.gender,
      race: filters.race,
      age: {
        min: filters.age.min ? Number(filters.age.min) : 18,
        max: filters.age.max ? Number(filters.age.max) : 99,
      },
      location: { state: filters.location.state, county: filters.location.county },
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
        case_type: form.case_type || null,
        hours_requested: form.hours_requested ? Number(form.hours_requested) : null,
        focus_group_type: form.focus_group_type || null,
        county: form.county || null,
        participants_from_county: form.participants_from_county || null,

        documentation_type: form.documentation_type, // Now explicitly handled
        status: "current",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        session_completion_timeframe: form.session_completion_timeframe || null,
        deadline_date: (() => {
          const daysMap: Record<string, number> = {
            "Within a Week": 7,
            "Within 2 Weeks": 14,
            "Within a Month": 30,
            "Within 3 Months": 90,
          };
          const days = daysMap[form.session_completion_timeframe];
          if (!days) return null;
          const d = new Date();
          d.setDate(d.getDate() + days);
          d.setHours(23, 59, 0, 0);
          return d.toISOString();
        })(),
        preferred_day: form.preferred_day || null,
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
    const noneSelected = values.length === 0;
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs px-2 py-1 rounded-md border select-none ${noneSelected ? "bg-slate-800 text-white border-slate-800 font-semibold" : "bg-card text-muted-foreground border-slate-200"}`}>
            No Preference 
          </span>
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
        <header className="flex items-center gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight">New Case Setup</h1>
          <div className="relative group">
            <button
              type="button"
              className="w-6 h-6 rounded-full border border-muted-foreground text-muted-foreground text-xs font-bold flex items-center justify-center hover:bg-muted transition-colors"
            >
              ?
            </button>
            <div className="absolute left-8 top-0 z-50 hidden group-hover:block w-80 bg-popover border border-border rounded-xl shadow-lg p-4 text-sm text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-2">How to create a case:</p>
              <ol className="space-y-1.5 list-none">
                <li><span className="font-medium text-foreground">1. Enter Case Details</span> — Fill in the title and a brief description.</li>
                <li><span className="font-medium text-foreground">2. Set Juror Filters (Optional)</span> — Narrow down the juror pool by demographics and preferences.</li>
                <li><span className="font-medium text-foreground">3. Save the Case.</span></li>
                <li><span className="font-medium text-foreground">4. Upload Case Files</span> — Add documents, exhibits, or evidence for jurors to review.</li>
              </ol>
            </div>
          </div>
        </header>

        {!caseId ? (
          <div className="space-y-8">

            {/* Case Details — always visible */}
            <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4 max-w-2xl">
              <label className="text-sm font-bold uppercase tracking-wider text-primary">Case Details</label>
              <input className="input w-full" placeholder="Case Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="input w-full" rows={2} placeholder="Brief Case Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <p className="text-xs text-muted-foreground">Only TexasJuryStudy will see this description.</p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type of Case</label>
                <select className="input w-full" value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })}>
                  <option value="">Select case type...</option>
                  <option value="Criminal Cases">Criminal Cases</option>
                  <option value="Personal Injury">Personal Injury</option>
                  <option value="Civil Cases">Civil Cases</option>
                  <option value="Administrative Cases">Administrative Cases</option>
                  <option value="Constitutional Cases">Constitutional Cases</option>
                  <option value="Family Law Cases">Family Law Cases</option>
                  <option value="Bankruptcy Cases">Bankruptcy Cases</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Number of Hours Requested</label>
                <input type="number" className="input w-full" placeholder="1" min="1" value={form.hours_requested} onChange={(e) => setForm({ ...form, hours_requested: e.target.value })} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type of Focus Group</label>
                <select className="input w-full" value={form.focus_group_type} onChange={(e) => setForm({ ...form, focus_group_type: e.target.value })}>
                  <option value="">Select focus group type...</option>
                  <option value="Narrative Type">Narrative Type</option>
                  <option value="Opening Statement">Opening Statement</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-2 relative" ref={countyRef}>
                <label className="text-sm font-medium">What county is your pending case in?</label>
                <input
                  className="input w-full"
                  placeholder="Start typing county..."
                  value={countyQuery}
                  onChange={(e) => {
                    setCountyQuery(e.target.value);
                    setShowCountySuggestions(true);
                    if (!e.target.value) setForm({ ...form, county: "" });
                  }}
                  onFocus={() => { if (countyQuery) setShowCountySuggestions(true); }}
                />
                {showCountySuggestions && countyQuery && (() => {
                  const filtered = TEXAS_COUNTIES.filter((c: string) =>
                    c.toLowerCase().includes(countyQuery.toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <div className="absolute z-50 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filtered.slice(0, 8).map((c: string) => (
                        <div
                          key={c}
                          onClick={() => {
                            setCountyQuery(c);
                            setForm({ ...form, county: c });
                            setShowCountySuggestions(false);
                          }}
                          className="px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer"
                        >
                          {c}
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Do you prefer participants from your county?</label>
                <select className="input w-full" value={form.participants_from_county} onChange={(e) => setForm({ ...form, participants_from_county: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Session Completion Timeframe</label>
                <select
                  className="input w-full"
                  value={form.session_completion_timeframe}
                  onChange={(e) => setForm({ ...form, session_completion_timeframe: e.target.value })}
                >
                  <option value="">Select a timeframe...</option>
                  <option value="Within a Week">Within a Week</option>
                  <option value="Within 2 Weeks">Within 2 Weeks</option>
                  <option value="Within a Month">Within a Month</option>
                  <option value="Within 3 Months">Within 3 Months</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred Day of the Week</label>
                <select
                  className="input w-full"
                  value={form.preferred_day}
                  onChange={(e) => setForm({ ...form, preferred_day: e.target.value })}
                >
                  <option value="">No preference</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>

            </div>

            {/* Toggle button */}
            <button
              type="button"
              onClick={() => {
                if (showFilters) {
                  // Switching to "No Filters" — clear all filters
                  setFilters({
                    gender: [],
                    race: [],
                    age: { min: "", max: "" },
                    location: { state: [], county: [] },
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

                {/* COLUMN 1 — Scheduling, Location & Political */}
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

                  {/* Location filter — hidden, defaults to No Preference (empty arrays) */}
                  {/* <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Location</h3>
                    <p className="text-sm font-medium">State</p>
                    <div className="max-h-48 overflow-y-auto">
                      <MultiCheckbox label="" options={US_STATES} values={filters.location.state} onChange={(v) => setFilters({ ...filters, location: { ...filters.location, state: v } })} />
                    </div>
                    <p className="text-sm font-medium mt-3">County</p>
                    <div className="max-h-48 overflow-y-auto">
                      <MultiCheckbox label="" options={TEXAS_COUNTIES} values={filters.location.county} onChange={(v) => setFilters({ ...filters, location: { ...filters.location, county: v } })} />
                    </div>
                  </div> */}

                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Political Context</h3>
                    <MultiCheckbox label="Political Affiliation" options={["Republican", "Democrat", "Other"]} values={filters.political_affiliation} onChange={(v) => setFilters({ ...filters, political_affiliation: v })} />
                  </div>

                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Eligibility & Status</h3>
                    <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } })} />
                    <YesNoSelect label="Has children?" value={filters.eligibility.has_children} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, has_children: v } })} />
                    <YesNoSelect label="Currently employed?" value={filters.eligibility.currently_employed} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, currently_employed: v } })} />
                  </div>
                </div>

                {/* COLUMN 2 — Demographics */}
                <div className="space-y-6 self-start">
                  <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Age & Identity</h3>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Age Range</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          className="border rounded px-3 py-2 text-sm w-24"
                          value={filters.age.min}
                          onChange={(e) => setFilters({ ...filters, age: { ...filters.age, min: e.target.value } })}
                        />
                        <span className="text-sm text-muted-foreground">–</span>
                        <input
                          type="number"
                          placeholder="Max"
                          className="border rounded px-3 py-2 text-sm w-24"
                          value={filters.age.max}
                          onChange={(e) => setFilters({ ...filters, age: { ...filters.age, max: e.target.value } })}
                        />
                      </div>
                    </div>
                    <MultiCheckbox label="Gender" options={["Male", "Female", "Other"]} values={filters.gender} onChange={(v) => setFilters({ ...filters, gender: v })} />
                    <MultiCheckbox label="Race" options={["Caucasian", "African American", "Asian", "Native American", "Middle Eastern", "Latino/Hispanic", "Multi-racial", "Other"]} values={filters.race} onChange={(v) => setFilters({ ...filters, race: v })} />
                  </div>
                </div>

                {/* COLUMN 3 — Socioeconomic */}
                <div className="space-y-6 self-start">
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

            {/* TRANSCRIPT PRICING PREVIEW */}
            <ReceiptPricingPreview
              hoursRequested={form.hours_requested ? Number(form.hours_requested) : 1}
              filters={{
                gender: filters.gender,
                race: filters.race,
                age: filters.age.min || filters.age.max
                  ? { min: Number(filters.age.min) || 18, max: Number(filters.age.max) || 99 }
                  : undefined,
                location: { state: filters.location.state, county: filters.location.county },
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
              } as CaseFilters}
            />

            {/* SAVE BUTTON */}
            <button onClick={createCaseAndUpload} disabled={loading} className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
              {loading ? "Establishing Case..." : "Save Case & Filter"}
            </button>
          </div>
        ) : (
          <div className="flex gap-8 items-start animate-in zoom-in-95 duration-500">
            {/* Left — Success + Uploads */}
            <div className="flex-1 min-w-0 space-y-6 text-center">
              <div className="p-10 bg-green-500/5 border border-green-500/20 rounded-[32px]">
                <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-bold">✓</div>
                <h2 className="text-3xl font-bold text-green-700">Case Ranking Profile Saved</h2>
                <p className="text-green-600 mt-2 text-lg">Your attributes are matched. Please upload the required documents to start finding participants.</p>
              </div>
              <CaseDocumentUploader caseId={caseId} />

              {/* Google Drive Link */}
              <div className="text-left border border-slate-200 rounded-2xl bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  <span className="text-sm font-semibold text-slate-800">Add Google Drive Link</span>
                  <span className="text-xs text-slate-400 font-normal">(optional)</span>
                </div>

                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="https://drive.google.com/..."
                    value={driveLink}
                    onChange={(e) => { setDriveLink(e.target.value); setDriveLinkSaved(false); }}
                    disabled={driveLinkSaved}
                  />
                  <button
                    type="button"
                    onClick={saveDriveLink}
                    disabled={!driveLink.trim() || driveLinkSaving || driveLinkSaved}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {driveLinkSaved ? "Saved ✓" : driveLinkSaving ? "Saving…" : "Save"}
                  </button>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-slate-500 leading-relaxed">
                  <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border border-slate-400 text-slate-400 flex items-center justify-center font-bold text-[9px]">i</span>
                  Make sure sharing is set to <strong className="text-slate-700">&ldquo;Anyone with the link can view&rdquo;</strong> in Google Drive so all participants can access it.
                </p>
              </div>

              <button onClick={() => window.location.href = "/dashboard/presenter"} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors underline decoration-2 underline-offset-8">
                Back to Presenter Dashboard
              </button>
            </div>

            {/* Right — Focus Group Video Instructions */}
            {form.focus_group_type && (() => {
              const faqVideos =
                form.focus_group_type === "Narrative Type"
                  ? FOCUS_GROUP_VIDEOS.narrative
                  : form.focus_group_type === "Opening Statement"
                    ? FOCUS_GROUP_VIDEOS.openingStatement
                    : [];

              return (
                <div className="w-[420px] shrink-0 sticky top-12 self-start">
                  <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="bg-slate-900 px-5 py-4">
                      <h3 className="text-base font-semibold text-white">
                        {form.focus_group_type} — Video Guide
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Watch the overview{faqVideos.length > 0 ? " and explore common questions below" : ""}
                      </p>
                    </div>

                    {/* General / Overview Video — always shown */}
                    <div className="p-5 space-y-3">
                      <VideoPlayer url={FOCUS_GROUP_VIDEOS.general.url} />
                      <h4 className="text-sm font-semibold text-foreground leading-snug">
                        {FOCUS_GROUP_VIDEOS.general.title}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {form.focus_group_type === "Narrative Type"
                          ? "Present your case as a story. Walk participants through the facts chronologically and let them respond to the narrative as it unfolds."
                          : form.focus_group_type === "Opening Statement"
                            ? "Deliver your opening statement to the participants as if they were jurors. Gather their feedback on persuasiveness and clarity."
                            : "Customize your session format as needed. Follow the admin-provided instructions for this focus group type."}
                      </p>
                    </div>

                    {/* FAQ-style Video Accordion — Narrative & Opening Statement only */}
                    {faqVideos.length > 0 && (
                      <div className="border-t border-slate-200">
                        <div className="px-5 pt-4 pb-2">
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                            Frequently Asked Questions
                          </h4>
                        </div>
                        <div className="px-5 pb-5 space-y-2">
                          {faqVideos.map((faq, idx) => {
                            const isOpen = openVideoFaq === idx;
                            return (
                              <div
                                key={idx}
                                className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenVideoFaq(isOpen ? null : idx)}
                                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                >
                                  <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  <span className="flex-1 text-sm font-medium text-slate-800 leading-snug">
                                    {faq.question}
                                  </span>
                                  {isOpen ? (
                                    <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                  )}
                                </button>
                                {isOpen && (
                                  <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                                    <VideoPlayer url={faq.url} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>
    </main>
  );
}