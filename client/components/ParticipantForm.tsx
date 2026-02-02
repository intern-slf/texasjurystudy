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

type YesNoSetter = React.Dispatch<React.SetStateAction<string>>;

type YesNoField = {
  label: string;
  setter: YesNoSetter;
};

export default function ParticipantForm({ userId }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Select states
  const [gender, setGender] = useState("");
  const [race, setRace] = useState("");

  const [servedOnJury, setServedOnJury] = useState("");
  const [convictedFelon, setConvictedFelon] = useState("");
  const [usCitizen, setUsCitizen] = useState("");
  const [hasChildren, setHasChildren] = useState("");
  const [servedArmedForces, setServedArmedForces] = useState("");
  const [currentlyEmployed, setCurrentlyEmployed] = useState("");
  const [internetAccess, setInternetAccess] = useState("");

  const yesNoFields: YesNoField[] = [
    { label: "Served on a jury?", setter: setServedOnJury },
    { label: "Convicted felon?", setter: setConvictedFelon },
    { label: "U.S. Citizen?", setter: setUsCitizen },
    { label: "Have children?", setter: setHasChildren },
    { label: "Served in armed forces?", setter: setServedArmedForces },
    { label: "Currently employed?", setter: setCurrentlyEmployed },
    { label: "Internet access?", setter: setInternetAccess },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!gender || !race) {
      setError("Please complete all required selections.");
      setLoading(false);
      return;
    }

    const form = new FormData(e.currentTarget);

    const payload = {
      user_id: userId,

      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      age: Number(form.get("age")),
      gender,

      available_feb_4: !!form.get("feb_4"),
      available_feb_25: !!form.get("feb_25"),
      available_mar_18: !!form.get("mar_18"),

      email: form.get("email"),
      phone: form.get("phone"),

      street_address: form.get("street_address"),
      address_line_2: form.get("address_line_2"),
      city: form.get("city"),
      county: form.get("county"),
      state: "Texas",
      zip_code: form.get("zip_code"),

      race,

      served_on_jury: servedOnJury === "yes",
      convicted_felon: convictedFelon === "yes",
      us_citizen: usCitizen === "yes",

      marital_status: form.get("marital_status"),
      has_children: hasChildren === "yes",
      education_level: form.get("education_level"),
      served_armed_forces: servedArmedForces === "yes",

      political_affiliation: form.get("political_affiliation"),
      currently_employed: currentlyEmployed === "yes",
      industry: form.get("industry"),

      family_income: form.get("family_income"),
      internet_access: internetAccess === "yes",

      heard_about_us: form.get("heard_about_us"),
    };

    const { error } = await supabase
      .from("jury_participants")
      .insert(payload);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* BASIC INFO */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>First Name</Label>
          <Input name="first_name" required />
        </div>
        <div>
          <Label>Last Name</Label>
          <Input name="last_name" required />
        </div>
      </div>

      <div>
        <Label>Age</Label>
        <Input name="age" type="number" min={18} max={99} required />
      </div>

      <div>
        <Label>Gender</Label>
        <Select value={gender} onValueChange={setGender} required>
          <SelectTrigger>
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* AVAILABILITY */}
      <div className="space-y-2">
        <Label>Availability</Label>
        <div className="flex items-center gap-2">
          <Checkbox id="feb_4" name="feb_4" />
          <Label htmlFor="feb_4">Feb 4, 2026</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="feb_25" name="feb_25" />
          <Label htmlFor="feb_25">Feb 25, 2026</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="mar_18" name="mar_18" />
          <Label htmlFor="mar_18">Mar 18, 2026</Label>
        </div>
      </div>

      {/* CONTACT */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" required />
        </div>
        <div>
          <Label>Phone</Label>
          <Input name="phone" required />
        </div>
      </div>

      {/* ADDRESS */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Address</h3>

        <div>
          <Label>Street Address</Label>
          <Input name="street_address" required />
        </div>

        <div>
          <Label>Address Line 2</Label>
          <Input name="address_line_2" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>City</Label>
            <Input name="city" required />
          </div>
          <div>
            <Label>County</Label>
            <Input name="county" required />
          </div>
          <div>
            <Label>ZIP Code</Label>
            <Input name="zip_code" required />
          </div>
        </div>
      </div>

      {/* RACE */}
      <div>
        <Label>Race</Label>
        <Select value={race} onValueChange={setRace} required>
          <SelectTrigger>
            <SelectValue placeholder="Select race" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Caucasian">Caucasian</SelectItem>
            <SelectItem value="Asian">Asian</SelectItem>
            <SelectItem value="African American">African American</SelectItem>
            <SelectItem value="Hispanic">Hispanic</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* YES / NO QUESTIONS */}
      {yesNoFields.map(({ label, setter }) => (
        <div key={label}>
          <Label>{label}</Label>
          <Select onValueChange={setter} required>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}

      {/* OTHER REQUIRED FIELDS */}
      <div>
        <Label>Marital Status</Label>
        <Input name="marital_status" required />
      </div>

      <div>
        <Label>Education Level</Label>
        <Input name="education_level" required />
      </div>

      <div>
        <Label>Political Affiliation</Label>
        <Input name="political_affiliation" required />
      </div>

      <div>
        <Label>Family Income</Label>
        <Input name="family_income" required />
      </div>

      <div>
        <Label>How did you hear about us?</Label>
        <Input name="heard_about_us" required />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting..." : "Submit Profile"}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}
