"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PresenterSidebar from "@/components/PresenterSidebar";
import CaseDocumentUploader from "@/components/CaseDocumentUploader";

export default function NewCasePage() {
  const supabase = createClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    number_of_attendees: 10,
    documentation_type: "",
    scheduled_at: "",
  });

  const [filters, setFilters] = useState({
    age: { min: "", max: "" },
    gender: [] as string[],
    race: [] as string[],
    location: {
      city: [] as string[],
      county: [] as string[],
      state: [] as string[],
    },
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
      industry: "",
      family_income: [] as string[],
    },
    political_affiliation: [] as string[],
  });

  const [caseId, setCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* ===========================
      CREATE CASE (SOFT FILTER READY)
     =========================== */
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

    // SANITIZE: Ensure arrays are present and values are typed for the SQL ranking function
    const softFilterPayload = {
      age: {
        min: filters.age.min ? Number(filters.age.min) : 18,
        max: filters.age.max ? Number(filters.age.max) : 100,
      },
      gender: filters.gender || [],
      race: filters.race || [],
      location: {
        city: filters.location.city || [],
        county: filters.location.county || [],
        state: filters.location.state || [],
      },
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
        marital_status: filters.socioeconomic.marital_status || [],
        education_level: filters.socioeconomic.education_level || [],
        industry: filters.socioeconomic.industry || "",
        family_income: filters.socioeconomic.family_income || [],
      },
      political_affiliation: filters.political_affiliation || [],
    };

    const { data, error } = await supabase
      .from("cases")
      .insert({
        user_id: user.id,
        title: form.title,
        description: form.description,
        number_of_attendees: form.number_of_attendees,
        documentation_type: form.documentation_type,
        status: "current",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        filters: softFilterPayload, // This JSON is now ready for RPC ranking
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

  /* ===========================
      UI HELPERS
     =========================== */
  function YesNoSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void; }) {
    return (
      <div className="flex flex-col space-y-1">
        <label className="text-sm font-medium text-foreground">{label}</label>
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
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="flex flex-wrap gap-4">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
              <input
                type="checkbox"
                checked={values.includes(opt)}
                onChange={() => onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt])}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen bg-background">
      <PresenterSidebar />

      <section className="flex-1 max-w-4xl px-8 py-12 space-y-8 overflow-y-auto">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Create New Case</h1>
          <p className="text-muted-foreground mt-2">Set up your case details and define juror preferences for ranking.</p>
        </header>

        {!caseId ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* CORE INFO */}
            <div className="grid gap-4">
              <input
                className="input text-lg font-medium"
                placeholder="Case Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className="input min-h-[120px]"
                placeholder="Briefly describe the case and target audience..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Preference Order <span className="text-xs font-normal bg-secondary px-2 py-1 rounded text-secondary-foreground">Soft Filter Mode</span>
              </h2>
              <p className="text-sm text-muted-foreground mb-6">Participants meeting these criteria will appear at the top of your list.</p>
            </div>

            {/* PREFERENCES GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scheduled Date & Time</label>
                  <input type="datetime-local" className="input" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Preferred Age Range</label>
                  <div className="flex gap-4">
                    <input type="number" className="input flex-1" placeholder="Min" value={filters.age.min} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, min: e.target.value } })} />
                    <input type="number" className="input flex-1" placeholder="Max" value={filters.age.max} onChange={(e) => setFilters({ ...filters, age: { ...filters.age, max: e.target.value } })} />
                  </div>
                </div>

                <MultiCheckbox label="Gender Preference" options={["Male", "Female", "Other"]} values={filters.gender} onChange={(v) => setFilters({ ...filters, gender: v })} />
                <MultiCheckbox label="Race / Ethnicity" options={["Caucasian", "African American", "Asian", "Latino/Hispanic", "Other"]} values={filters.race} onChange={(v) => setFilters({ ...filters, race: v })} />
              </div>

              <div className="space-y-6">
                <div className="bg-secondary/20 p-4 rounded-lg space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal & Eligibility</p>
                  <YesNoSelect label="U.S. Citizen?" value={filters.eligibility.us_citizen} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, us_citizen: v } })} />
                  <YesNoSelect label="Convicted felon?" value={filters.eligibility.convicted_felon} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, convicted_felon: v } })} />
                  <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury} onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } })} />
                </div>
                
                <MultiCheckbox label="Political Affiliation" options={["Democrat", "Republican", "Independent", "Other"]} values={filters.political_affiliation} onChange={(v) => setFilters({ ...filters, political_affiliation: v })} />
              </div>
            </div>

            <button
              onClick={createCaseAndUpload}
              disabled={loading}
              className="w-full md:w-auto px-10 py-4 bg-primary text-primary-foreground rounded-lg font-bold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? "Creating Case..." : "Save Case & Upload Documents"}
            </button>
          </div>
        ) : (
          <div className="animate-in zoom-in-95 duration-300">
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl mb-8">
              <h2 className="text-xl font-bold text-primary mb-2">Case Created Successfully!</h2>
              <p className="text-sm">Your Filter is now active. Upload your case documents below to proceed.</p>
            </div>
            <CaseDocumentUploader caseId={caseId} />
            <div className="mt-8 flex items-center justify-between">
              <button onClick={() => (window.location.href = "/dashboard/presenter")} className="text-sm font-medium hover:underline text-muted-foreground">
                Skip for now and go to dashboard
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}