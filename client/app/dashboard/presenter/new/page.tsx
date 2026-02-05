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

  /* ===========================
      FILTER STATE (JSON)
     =========================== */
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
      CREATE CASE
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

    const { data, error } = await supabase
      .from("cases")
      .insert({
        user_id: user.id,
        title: form.title,
        description: form.description,
        number_of_attendees: form.number_of_attendees,
        documentation_type: form.documentation_type,
        status: "current",
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,

        filters: {
          age: {
            min: filters.age.min ? Number(filters.age.min) : null,
            max: filters.age.max ? Number(filters.age.max) : null,
          },
          gender: filters.gender,
          race: filters.race,
          location: filters.location,
          eligibility: {
            served_on_jury: filters.eligibility.served_on_jury || null,
            convicted_felon: filters.eligibility.convicted_felon || null,
            us_citizen: filters.eligibility.us_citizen || null,
            has_children: filters.eligibility.has_children || null,
            served_armed_forces: filters.eligibility.served_armed_forces || null,
            currently_employed: filters.eligibility.currently_employed || null,
            internet_access: filters.eligibility.internet_access || null,
          },
          socioeconomic: {
            marital_status: filters.socioeconomic.marital_status,
            education_level: filters.socioeconomic.education_level,
            industry: filters.socioeconomic.industry || null,
            family_income: filters.socioeconomic.family_income,
          },
          political_affiliation:
            filters.political_affiliation.length
              ? filters.political_affiliation
              : null,
        },
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
  function YesNoSelect({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) {
    return (
      <div className="flex flex-col space-y-1">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <select
          className="input mt-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Any</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
    );
  }

  function MultiCheckbox({
    label,
    options,
    values,
    onChange,
  }: {
    label: string;
    options: string[];
    values: string[];
    onChange: (v: string[]) => void;
  }) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="flex flex-wrap gap-4">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={values.includes(opt)}
                onChange={() =>
                  onChange(
                    values.includes(opt)
                      ? values.filter((v) => v !== opt)
                      : [...values, opt]
                  )
                }
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen">
      <PresenterSidebar />

      <section className="flex-1 max-w-3xl px-8 py-20 space-y-6">
        <h1 className="text-2xl font-semibold">New Case</h1>

        {!caseId ? (
          <>
            <input
              className="input"
              placeholder="Title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />

            <textarea
              className="input"
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />

            {/* PREFERENCE ORDER HEADER */}
            <div className="pt-4 border-t">
              <h2 className="text-xl font-bold text-foreground">Preference Order</h2>
              <p className="text-sm text-muted-foreground mb-6">Define Juror Demographic Preferences</p>
            </div>

            {/* AGE SECTION */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Age Range</label>
              <div className="flex gap-4">
                <input
                  type="number"
                  className="input flex-1"
                  placeholder="Min age"
                  value={filters.age.min}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      age: { ...filters.age, min: e.target.value },
                    })
                  }
                />
                <input
                  type="number"
                  className="input flex-1"
                  placeholder="Max age"
                  value={filters.age.max}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      age: { ...filters.age, max: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <MultiCheckbox
              label="Gender"
              options={["Male", "Female", "Other"]}
              values={filters.gender}
              onChange={(v) =>
                setFilters({ ...filters, gender: v })
              }
            />

            <MultiCheckbox
              label="Race"
              options={[
                "Caucasian",
                "African American",
                "Asian",
                "Native American",
                "Middle Eastern",
                "Latino/Hispanic",
                "Multi-racial",
                "Other"
              ]}
              values={filters.race}
              onChange={(v) =>
                setFilters({ ...filters, race: v })
              }
            />

            <MultiCheckbox
              label="State"
              options={["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
                        "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
                        "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
                        "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
                        "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
                        "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
                        "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
                        "Virginia","Washington","West Virginia","Wisconsin","Wyoming",]}
              values={filters.location.state}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  location: { ...filters.location, state: v },
                })
              }
            />

            {/* ELIGIBILITY */}
            <div className="space-y-4">
              <YesNoSelect label="Served on a jury?" value={filters.eligibility.served_on_jury}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_on_jury: v } })} />

              <YesNoSelect label="Convicted felon?" value={filters.eligibility.convicted_felon}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, convicted_felon: v } })} />

              <YesNoSelect label="U.S. Citizen?" value={filters.eligibility.us_citizen}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, us_citizen: v } })} />

              <YesNoSelect label="Has children?" value={filters.eligibility.has_children}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, has_children: v } })} />

              <YesNoSelect label="Served in armed forces?" value={filters.eligibility.served_armed_forces}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, served_armed_forces: v } })} />

              <YesNoSelect label="Currently employed?" value={filters.eligibility.currently_employed}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, currently_employed: v } })} />

              <YesNoSelect label="Internet access?" value={filters.eligibility.internet_access}
                onChange={(v) => setFilters({ ...filters, eligibility: { ...filters.eligibility, internet_access: v } })} />
            </div>

            {/* SOCIOECONOMIC */}
            <MultiCheckbox
              label="Marital Status"
              options={[
                "Single / Never Married",
                "Married",
                "Divorced",
                "Separated",
                "Widowed"
              ]}
              values={filters.socioeconomic.marital_status}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  socioeconomic: {
                    ...filters.socioeconomic,
                    marital_status: v,
                  },
                })
              }
            />
            <MultiCheckbox
              label="Education Level"
              options={[
                "Less than High School",
                "High School or GED",
                "Associate's or Technical Degree",
                "Some College",
                "Bachelor Degree",
                "Graduate Degree",
              ]}
              values={filters.socioeconomic.education_level}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  socioeconomic: {
                    ...filters.socioeconomic,
                    education_level: v,
                  },
                })
              }
            />

            <MultiCheckbox
              label="Family Income"
              options={[
                "less than $40K",
                "$41-75K",
                "$75-100K",
                "$101-$150K",
                "$150K+"
              ]}
              values={filters.socioeconomic.family_income}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  socioeconomic: {
                    ...filters.socioeconomic,
                    family_income: v,
                  },
                })
              }
            />

            <MultiCheckbox
              label="Political Affiliation"
              options={[
                "Democrat",
                "Republican",
                "Other",
              ]}
              values={filters.political_affiliation}
              onChange={(v) =>
                setFilters({
                  ...filters,
                  political_affiliation: v,
                })
              }
            />

            <button
              onClick={createCaseAndUpload}
              disabled={loading}
              className="px-6 py-3 bg-primary text-primary-foreground rounded font-bold hover:opacity-90 transition-opacity"
            >
              {loading ? "Preparing..." : "Upload documents"}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-medium">
              Upload Case Documents
            </h2>
            <CaseDocumentUploader caseId={caseId} />
            <button
              onClick={() =>
                (window.location.href = "/dashboard/presenter")
              }
              className="text-sm underline opacity-70"
            >
              Finish & go to dashboard
            </button>
          </>
        )}
      </section>
    </main>
  );
}