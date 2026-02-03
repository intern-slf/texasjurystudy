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
  const [servedOnJury, setServedOnJury] = useState("");
  const [convictedFelon, setConvictedFelon] = useState("");
  const [usCitizen, setUsCitizen] = useState("");
  const [hasChildren, setHasChildren] = useState("");
  const [servedArmedForces, setServedArmedForces] = useState("");
  const [currentlyEmployed, setCurrentlyEmployed] = useState("");
  const [internetAccess, setInternetAccess] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [politicalAffiliation, setPoliticalAffiliation] = useState("");

  const yesNoFields = [
    { label: "Served on a jury?", value: servedOnJury, setter: setServedOnJury },
    { label: "Convicted felon?", value: convictedFelon, setter: setConvictedFelon },
    { label: "U.S. Citizen?", value: usCitizen, setter: setUsCitizen },
    { label: "Have children?", value: hasChildren, setter: setHasChildren },
    { label: "Served in armed forces?", value: servedArmedForces, setter: setServedArmedForces },
    { label: "Currently employed?", value: currentlyEmployed, setter: setCurrentlyEmployed },
    { label: "Internet access?", value: internetAccess, setter: setInternetAccess },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!gender || !race || !internetAccess || !maritalStatus || !politicalAffiliation) {
      setError("Please complete all dropdown selections.");
      setLoading(false);
      return;
    }

    const form = new FormData(e.currentTarget);

    // Mapped strictly to your Supabase schema columns
    const payload = {
      user_id: userId,
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      age: Number(form.get("age")),
      gender,
      race,
      county: form.get("county"),
      
      // Availability
      availability_weekdays: !!form.get("availability_weekdays"),
      availability_weekends: !!form.get("availability_weekends"),
      availability_anytime: !!form.get("availability_anytime"),
      
      // Contact
      email: form.get("email"),
      phone: form.get("phone"), // Database column: phone

      // Address
      street_address: form.get("street_address"), // Database column: street_address
      address_line_2: form.get("address_line_2"),
      city: form.get("city"),
      state: "Texas",
      zip_code: form.get("zip_code"),
      country: "USA",
      
      // Booleans
      served_on_jury: servedOnJury === "yes",
      convicted_felon: convictedFelon === "yes",
      us_citizen: usCitizen === "yes",
      has_children: hasChildren === "yes",
      served_armed_forces: servedArmedForces === "yes",
      currently_employed: currentlyEmployed === "yes",
      internet_access: internetAccess === "yes",
      
      // Select Strings & Inputs
      marital_status: maritalStatus, 
      political_affiliation: politicalAffiliation,
      education_level: form.get("education_level"),
      industry: form.get("industry"),
      family_income: form.get("family_income"), 
      heard_about_us: form.get("heard_about_us"),

      // Timestamps
      entry_date: new Date().toISOString(),
      date_updated: new Date().toISOString(),
    };

    // Use .upsert() to handle "duplicate key value violates unique constraint"
    const { error: dbError } = await supabase
      .from("jury_participants")
      .upsert(payload, { onConflict: 'user_id' });

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    // Success - page will reload to clear state or you could redirect
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

      {/* CONTACT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div className="space-y-2">
          <Label>Race</Label>
          <Select value={race} onValueChange={setRace} required>
            <SelectTrigger><SelectValue placeholder="Select race" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Caucasian">Caucasian</SelectItem>
              <SelectItem value="Asian">Asian</SelectItem>
              <SelectItem value="African American">African American</SelectItem>
              <SelectItem value="Hispanic">Hispanic</SelectItem>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input name="city" required />
          </div>
          <div className="space-y-2">
            <Label>County</Label>
            <Input name="county" required />
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
          <div className="flex items-center gap-2">
            <Checkbox id="availability_anytime" name="availability_anytime" />
            <Label htmlFor="availability_anytime">Anytime</Label>
          </div>
        </div>
      </div>

      {/* ELIGIBILITY MAP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
        {yesNoFields.map(({ label, value, setter }) => (
          <div key={label} className="space-y-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={setter} required>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* ADDITIONAL DETAILS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
        <div className="space-y-2">
          <Label>Marital Status</Label>
          <Select value={maritalStatus} onValueChange={setMaritalStatus} required>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Education Level</Label>
          <Input name="education_level" required />
        </div>

        <div className="space-y-2">
          <Label>Political Affiliation</Label>
          <Select value={politicalAffiliation} onValueChange={setPoliticalAffiliation} required>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Industry / Field</Label>
          <Input name="industry" />
        </div>

        <div className="space-y-2">
          <Label>Family Annual Income</Label>
          <Input name="family_income" required />
        </div>

        <div className="space-y-2">
          <Label>How did you hear about us?</Label>
          <Input name="heard_about_us" required />
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