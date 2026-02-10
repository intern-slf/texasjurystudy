"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";

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

const DOCUMENT_TYPES = ["Legal Brief", "Witness Statement", "Expert Report", "Evidence Summary", "Other"];

export default function NewCasePage() {
  const supabase = createClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    number_of_attendees: 10,
    documentation_type: "Legal Brief", // Default to prevent null constraint error
    scheduled_at: "",
  });

  const [filters, setFilters] = useState({
    age: { min: "", max: "" },
    gender: [] as string[],
    race: [] as string[],
    location: { state: [] as string[] },
    eligibility: {
      served_on_jury: "",
      convicted_felon: "",
      us_citizen: "",
      has_children: "",
      served_armed_forces: "",
      currently_employed: "",
      internet_access: "",
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
        convicted_felon: filters.eligibility.convicted_felon || "Any",
        us_citizen: filters.eligibility.us_citizen || "Any",
        has_children: filters.eligibility.has_children || "Any",
        served_armed_forces: filters.eligibility.served_armed_forces || "Any",
        currently_employed: filters.eligibility.currently_employed || "Any",
        internet_access: filters.eligibility.internet_access || "Any",
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
        filters: softFilterPayload,
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
          <option value="">Any (No weight)</option>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* CASE INFO */}
            <div className="lg:col-span-4 space-y-6">
              <div className="space-y-4 bg-card p-6 rounded-2xl border shadow-sm">
                <label className="text-sm font-bold uppercase tracking-wider text-primary">Case Details</label>
                <input className="input w-full" placeholder="Case Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <textarea className="input w-full min-h-[120px]" placeholder="Case Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Documentation Type</label>
                  <select 
                    className="input w-full" 
                    value={form.documentation_type} 
                    onChange={(e) => setForm({ ...form, documentation_type: e.target.value })}
                  >
                    {DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled Date</label>
                  <input type="datetime-local" className="input w-full" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
                </div>
              </div>
              
              <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
                <label className="text-sm font-bold uppercase tracking-wider text-primary">Age & Identity</label>
                <div className="flex gap-4">
                  <input type="number" className="input flex-1" placeholder="Min" value={filters.age.min} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, min: e.target.value } })} />
                  <input type="number" className="input flex-1" placeholder="Max" value={filters.age.max} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, max: e.target.value } })} />
                </div>
                <MultiCheckbox label="Gender" options={["Male", "Female", "Other"]} values={filters.gender} onChange={(v) => setFilters({ ...filters, gender: v })} />
                <MultiCheckbox label="Race" options={["Caucasian", "African American", "Asian", "Native American", "Middle Eastern", "Latino/Hispanic", "Multi-racial", "Other"]} values={filters.race} onChange={(v) => setFilters({ ...filters, race: v })} />
              </div>



              <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
                <label className="text-sm font-bold uppercase tracking-wider text-primary">Number of Attendees</label>
                <div className="flex gap-4">
                  <input type="number" className="number_of_attendees" placeholder="10" />
                </div>
              </div>

            </div>
            

            {/* PREFERENCES SECTION */}
            <div className="lg:col-span-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg border-b pb-2">Eligibility & Status</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <YesNoSelect label="U.S. Citizen?" value={filters.eligibility.us_citizen} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, us_citizen: v } })} />
                    <YesNoSelect label="Convicted felon?" value={filters.eligibility.convicted_felon} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, convicted_felon: v } })} />
                    <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } })} />
                    <YesNoSelect label="Has children?" value={filters.eligibility.has_children} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, has_children: v } })} />
                    <YesNoSelect label="Currently employed?" value={filters.eligibility.currently_employed} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, currently_employed: v } })} />
                    <YesNoSelect label="Internet access?" value={filters.eligibility.internet_access} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, internet_access: v } })} />
                  </div>
                </div>

                <div className="space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg border-b pb-2">Socioeconomic Factors</h3>
                  <MultiCheckbox label="Marital Status" options={["Single / Never Married", "Married", "Divorced", "Separated", "Widowed"]} values={filters.socioeconomic.marital_status} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, marital_status: v } })} />
                  <MultiCheckbox label="Education Level" options={["Less than High School", "High School or GED", "Associate's or Technical Degree", "Some College", "Bachelor Degree", "Graduate Degree"]} values={filters.socioeconomic.education_level} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, education_level: v } })} />
                  <MultiCheckbox label="Family Income" options={["less than $40K", "$41-75K", "$75-100K", "$101-$150K", "$150K+"]} values={filters.socioeconomic.family_income} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, family_income: v } })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg border-b pb-2">Location & Schedule</h3>
                  <div className="max-h-48 overflow-y-auto pr-2">
                    <MultiCheckbox label="Target States" options={US_STATES} values={filters.location.state} onChange={(v) => setFilters({ ...filters, location: { state: v } })} />
                  </div>
                  <MultiCheckbox label="General Availability" options={["Weekdays", "Weekends"]} values={filters.socioeconomic.availability} onChange={(v) => setFilters({ ...filters, socioeconomic: { ...filters.socioeconomic, availability: v } })} />
                </div>

                <div className="space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
                  <h3 className="font-bold text-lg border-b pb-2">Political Context</h3>
                  <MultiCheckbox label="Political Affiliation" options={["Republican", "Democrat", "Other"]} values={filters.political_affiliation} onChange={(v) => setFilters({ ...filters, political_affiliation: v })} />
                </div>
              </div>

              <button onClick={createCaseAndUpload} disabled={loading} className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
                {loading ? "Establishing Case..." : "Save Case & Launch Soft Filter"}
              </button>
            </div>
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