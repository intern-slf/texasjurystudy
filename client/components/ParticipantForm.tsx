"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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

type Props = {
  userId: string;
};

export default function ParticipantForm({ userId }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled states for Selects
  const [gender, setGender] = useState("");
  const [race, setRace] = useState("");
  const [state, setState] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [politicalAffiliation, setPoliticalAffiliation] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [currentlyEmployed, setCurrentlyEmployed] = useState("");
  const [familyIncome, setFamilyIncome] = useState("");
  const [referralSource, setReferralSource] = useState("");

  // Yes/No logic states
  const [servedOnJury, setServedOnJury] = useState("");
  const [convictedFelon, setConvictedFelon] = useState("");
  const [usCitizen, setUsCitizen] = useState("");
  const [hasChildren, setHasChildren] = useState("");
  const [servedArmedForces, setServedArmedForces] = useState("");
  const [internetAccess, setInternetAccess] = useState("");

  const yesNoFields = [
    { label: "Served on a jury?", value: servedOnJury, setter: setServedOnJury },
    { label: "Convicted felon?", value: convictedFelon, setter: setConvictedFelon },
    { label: "U.S. Citizen?", value: usCitizen, setter: setUsCitizen },
    { label: "Have children?", value: hasChildren, setter: setHasChildren },
    { label: "Served in armed forces?", value: servedArmedForces, setter: setServedArmedForces },
    { label: "Internet access?", value: internetAccess, setter: setInternetAccess },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Comprehensive validation
    if (
      !gender || !race || !state || !maritalStatus || !politicalAffiliation || 
      !educationLevel || !currentlyEmployed || !familyIncome || !referralSource ||
      !servedOnJury || !convictedFelon || !usCitizen || !hasChildren || !servedArmedForces || !internetAccess
    ) {
      setError("Please complete all dropdown selections.");
      setLoading(false);
      return;
    }

    const form = new FormData(e.currentTarget);
    const isEmployed = currentlyEmployed === "Yes" || currentlyEmployed === "Self-employed";

    const payload = {
      user_id: userId,
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      age: Number(form.get("age")),
      gender,
      race,
      county: form.get("county"),
      availability_weekdays: form.get("availability_weekdays") ? "Yes" : "No",
      availability_weekends: form.get("availability_weekends") ? "Yes" : "No",
      email: form.get("email"),
      phone: form.get("phone"),
      street_address: form.get("street_address"),
      address_line_2: form.get("address_line_2"),
      city: form.get("city"),
      state,
      zip_code: form.get("zip_code"),
      country: "USA",
      served_on_jury: servedOnJury,
      convicted_felon: convictedFelon,
      us_citizen: usCitizen,
      has_children: hasChildren,
      served_armed_forces: servedArmedForces,
      currently_employed: currentlyEmployed,
      internet_access: internetAccess,
      marital_status: maritalStatus, 
      political_affiliation: politicalAffiliation,
      education_level: educationLevel,
      // Fixed logic for industry field
      industry: isEmployed ? form.get("industry") : "N/A",
      family_income: familyIncome, 
      heard_about_us: referralSource,
      entry_date: new Date().toISOString(),
      date_updated: new Date().toISOString(),
    };

    const { error: dbError } = await supabase
      .from("jury_participants")
      .upsert(payload, { onConflict: 'user_id' });

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-8 p-4">
      <h2 className="text-2xl font-bold">Participant Profile</h2>

      {/* BASIC INFO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name</Label>
          <Input id="first_name" name="first_name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name</Label>
          <Input id="last_name" name="last_name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age">Age</Label>
          <Input id="age" name="age" type="number" min={18} max={99} required />
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select value={gender} onValueChange={setGender} required>
            <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* RACE & CONTACT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div className="space-y-2">
          <Label>Race</Label>
          <Select value={race} onValueChange={setRace} required>
            <SelectTrigger><SelectValue placeholder="Select race" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Caucasian">Caucasian</SelectItem>
              <SelectItem value="African American">African American</SelectItem>
              <SelectItem value="Asian">Asian</SelectItem>
              <SelectItem value="Native American">Native American</SelectItem>
              <SelectItem value="Middle Eastern">Middle Eastern</SelectItem>
              <SelectItem value="Latino/Hispanic">Latino/Hispanic</SelectItem>
              <SelectItem value="Multi-racial">Multi-racial</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input id="phone" name="phone" required />
        </div>
      </div>

      {/* ADDRESS */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">Address</h3>
        <div className="space-y-2">
          <Label>Street Address</Label>
          <Input name="street_address" required />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input name="city" required />
          </div>
          <div className="space-y-2">
            <Label>County</Label>
            <Input name="county" required />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Select value={state} onValueChange={setState} required>
              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ZIP Code</Label>
            <Input name="zip_code" required />
          </div>
        </div>
      </div>

      {/* AVAILABILITY */}
      <div className="space-y-3 border-t pt-4">
        <Label className="text-base font-semibold">Availability</Label>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="availability_weekdays" name="availability_weekdays" />
            <Label htmlFor="availability_weekdays">Weekdays</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="availability_weekends" name="availability_weekends" />
            <Label htmlFor="availability_weekends">Weekends</Label>
          </div>
        </div>
      </div>

      {/* YES/NO SECTION & EMPLOYMENT LOGIC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
        {yesNoFields.map(({ label, value, setter }) => (
          <div key={label} className="space-y-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={setter} required>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
        
        {/* Employment Question */}
        <div className="space-y-2">
          <Label>Are you currently employed?</Label>
          <Select value={currentlyEmployed} onValueChange={setCurrentlyEmployed} required>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="Self-employed">Self-employed</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conditional Industry Field - Fixed TS2367 */}
        {(currentlyEmployed === "Yes" || currentlyEmployed === "Self-employed") && (
          <div className="space-y-2 animate-in fade-in duration-300">
            <Label htmlFor="industry">Industry / Field</Label>
            <Input 
              id="industry"
              name="industry" 
              placeholder="e.g. Healthcare, Tech" 
              required 
            />
          </div>
        )}
      </div>

      {/* ADDITIONAL DETAILS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div className="space-y-2">
          <Label>Marital Status</Label>
          <Select value={maritalStatus} onValueChange={setMaritalStatus} required>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Single / Never Married">Single / Never Married</SelectItem>
              <SelectItem value="Married">Married</SelectItem>
              <SelectItem value="Divorced">Divorced</SelectItem>
              <SelectItem value="Separated">Separated</SelectItem>
              <SelectItem value="Widowed">Widowed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Highest level of education</Label>
          <Select value={educationLevel} onValueChange={setEducationLevel} required>
            <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Less than High School">Less than High School</SelectItem>
              <SelectItem value="High School or GED">High School or GED</SelectItem>
              <SelectItem value="Associate's or Technical Degree">Associates or Technical Degree</SelectItem>
              <SelectItem value="Some College">Some College</SelectItem>
              <SelectItem value="Bachelor Degree">Bachelor Degree</SelectItem>
              <SelectItem value="Graduate Degree">Graduate Degree</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Political Affiliation</Label>
          <Select value={politicalAffiliation} onValueChange={setPoliticalAffiliation} required>
            <SelectTrigger><SelectValue placeholder="Select affiliation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Republican">Republican</SelectItem>
              <SelectItem value="Democrat">Democrat</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Total Family Annual income</Label>
          <Select value={familyIncome} onValueChange={setFamilyIncome} required>
            <SelectTrigger><SelectValue placeholder="Select income range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="less than $40K">less than $40K</SelectItem>
              <SelectItem value="$41-75K">$41-75K</SelectItem>
              <SelectItem value="$75-100K">$75-100K</SelectItem>
              <SelectItem value="$101-$150K">$101-$150K</SelectItem>
              <SelectItem value="$150K+">$150K+</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>How did you hear about us?</Label>
          <Select value={referralSource} onValueChange={setReferralSource} required>
            <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Facebook">Facebook</SelectItem>
              <SelectItem value="Google Search">Google Search</SelectItem>
              <SelectItem value="Word of mouth">Word of mouth</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full h-12 text-lg">
        {loading ? "Submitting..." : "Submit Profile"}
      </Button>

      {error && (
        <p className="text-center text-red-500 font-medium p-2 bg-red-50 rounded">
          {error}
        </p>
      )}
    </form>
  );
}