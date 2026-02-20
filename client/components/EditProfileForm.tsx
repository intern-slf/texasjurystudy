"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Upload, X, CreditCard } from "lucide-react";

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
  participant: Record<string, any>;
};

export default function EditProfileForm({ participant }: Props) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Basic info
  const [firstName, setFirstName] = useState(participant.first_name || "");
  const [lastName, setLastName] = useState(participant.last_name || "");
  const [age, setAge] = useState(participant.age?.toString() || "");
  const [gender, setGender] = useState(participant.gender || "");
  const [race, setRace] = useState(participant.race || "");
  const [email, setEmail] = useState(participant.email || "");
  const [phone, setPhone] = useState(participant.phone || "");

  // Address
  const [streetAddress, setStreetAddress] = useState(participant.street_address || "");
  const [addressLine2, setAddressLine2] = useState(participant.address_line_2 || "");
  const [city, setCity] = useState(participant.city || "");
  const [county, setCounty] = useState(participant.county || "");
  const [state, setState] = useState(participant.state || "");
  const [zipCode, setZipCode] = useState(participant.zip_code || "");

  // ID
  const [driverLicenseNumber, setDriverLicenseNumber] = useState(participant.driver_license_number || "");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Availability
  const [availWeekdays, setAvailWeekdays] = useState(participant.availability_weekdays === "Yes");
  const [availWeekends, setAvailWeekends] = useState(participant.availability_weekends === "Yes");

  // Yes/No fields
  const [servedOnJury, setServedOnJury] = useState(participant.served_on_jury || "");
  const [convictedFelon, setConvictedFelon] = useState(participant.convicted_felon || "");
  const [usCitizen, setUsCitizen] = useState(participant.us_citizen || "");
  const [hasChildren, setHasChildren] = useState(participant.has_children || "");
  const [servedArmedForces, setServedArmedForces] = useState(participant.served_armed_forces || "");
  const [internetAccess, setInternetAccess] = useState(participant.internet_access || "");

  // Employment
  const [currentlyEmployed, setCurrentlyEmployed] = useState(participant.currently_employed || "");
  const [industry, setIndustry] = useState(participant.industry || "");

  // Details
  const [maritalStatus, setMaritalStatus] = useState(participant.marital_status || "");
  const [educationLevel, setEducationLevel] = useState(participant.education_level || "");
  const [politicalAffiliation, setPoliticalAffiliation] = useState(participant.political_affiliation || "");
  const [familyIncome, setFamilyIncome] = useState(participant.family_income || "");
  const [referralSource, setReferralSource] = useState(participant.heard_about_us || "");

  const isEmployed = currentlyEmployed === "Yes" || currentlyEmployed === "Self-employed";

  const yesNoFields = [
    { label: "Served on a jury?", value: servedOnJury, setter: setServedOnJury },
    { label: "Convicted felon?", value: convictedFelon, setter: setConvictedFelon },
    { label: "U.S. Citizen?", value: usCitizen, setter: setUsCitizen },
    { label: "Have children?", value: hasChildren, setter: setHasChildren },
    { label: "Served in armed forces?", value: servedArmedForces, setter: setServedArmedForces },
    { label: "Internet access?", value: internetAccess, setter: setInternetAccess },
  ];

  function handleIdFileChange(file: File | null) {
    if (!file) {
      setIdFile(null);
      setIdPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, etc.).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB.");
      return;
    }
    setIdFile(file);
    setIdPreview(URL.createObjectURL(file));
    setError(null);
  }

  function removeIdFile() {
    setIdFile(null);
    setIdPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (
      !gender || !race || !state || !maritalStatus || !politicalAffiliation ||
      !educationLevel || !currentlyEmployed || !familyIncome || !referralSource ||
      !servedOnJury || !convictedFelon || !usCitizen || !hasChildren || !servedArmedForces || !internetAccess
    ) {
      setError("Please complete all dropdown selections.");
      setLoading(false);
      return;
    }

    // Upload new ID image if provided
    let idImagePath: string | null = participant.driver_license_image_url || null;
    if (idFile) {
      setUploadProgress(true);
      const fileExt = idFile.name.split(".").pop() || "jpg";
      const filePath = `${participant.user_id}/${Date.now()}-id.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("id-documents")
        .upload(filePath, idFile, { upsert: true });

      if (uploadError) {
        setError(`Failed to upload ID image: ${uploadError.message}`);
        setLoading(false);
        setUploadProgress(false);
        return;
      }

      idImagePath = filePath;
      setUploadProgress(false);
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      age: Number(age),
      gender,
      race,
      email,
      phone,
      street_address: streetAddress,
      address_line_2: addressLine2,
      city,
      county,
      state,
      zip_code: zipCode,
      country: "USA",
      availability_weekdays: availWeekdays ? "Yes" : "No",
      availability_weekends: availWeekends ? "Yes" : "No",
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
      industry: isEmployed ? industry : "N/A",
      family_income: familyIncome,
      heard_about_us: referralSource,
      driver_license_number: driverLicenseNumber || null,
      driver_license_image_url: idImagePath,
      date_updated: new Date().toISOString(),
    };

    const { error: dbError } = await supabase
      .from("jury_participants")
      .update(payload)
      .eq("user_id", participant.user_id);

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-8 p-4">
      <div className="flex items-center gap-3">
        <Pencil className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Edit Profile</h2>
      </div>
      <p className="text-slate-500 text-sm -mt-4">
        Update any of your profile details below.
      </p>

      {/* BASIC INFO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>First Name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Last Name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Age</Label>
          <Input type="number" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} required />
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
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Phone Number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
      </div>

      {/* ADDRESS */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">Address</h3>
        <div className="space-y-2">
          <Label>Street Address</Label>
          <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Address Line 2 (Optional)</Label>
          <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>County</Label>
            <Input value={county} onChange={(e) => setCounty(e.target.value)} required />
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
            <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
          </div>
        </div>
      </div>

      {/* IDENTIFICATION */}
      <div className="space-y-4 border-t pt-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-lg">Identification</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Driver&apos;s License / State ID Number</Label>
            <Input
              value={driverLicenseNumber}
              onChange={(e) => setDriverLicenseNumber(e.target.value)}
              placeholder="e.g. 12345678 (TX format)"
            />
            <p className="text-xs text-slate-400">Enter your U.S. state-issued driver&apos;s license or ID card number</p>
          </div>
          <div className="space-y-2">
            <Label>Upload Driver&apos;s License / State ID Photo</Label>
            {participant.driver_license_image_url && !idFile && (
              <p className="text-xs text-green-600">✓ An ID image is already on file</p>
            )}
            <div
              className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                idPreview
                  ? "border-blue-300 bg-blue-50/50"
                  : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) handleIdFileChange(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleIdFileChange(e.target.files?.[0] || null)}
              />
              {idPreview ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={idPreview} alt="ID preview" className="mx-auto max-h-32 rounded-lg object-contain" />
                  <p className="text-xs text-slate-500 truncate">{idFile?.name}</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeIdFile(); }}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              ) : (
                <div className="py-4 space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-slate-400" />
                  <p className="text-sm text-slate-500">
                    {participant.driver_license_image_url ? "Click to replace existing photo" : "Click or drag & drop to upload"}
                  </p>
                  <p className="text-xs text-slate-400">JPG, PNG — Max 10 MB</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AVAILABILITY */}
      <div className="space-y-3 border-t pt-4">
        <Label className="text-base font-semibold">Availability</Label>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit_avail_weekdays"
              checked={availWeekdays}
              onCheckedChange={(v) => setAvailWeekdays(v === true)}
            />
            <Label htmlFor="edit_avail_weekdays">Weekdays</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit_avail_weekends"
              checked={availWeekends}
              onCheckedChange={(v) => setAvailWeekends(v === true)}
            />
            <Label htmlFor="edit_avail_weekends">Weekends</Label>
          </div>
        </div>
      </div>

      {/* YES/NO SECTION & EMPLOYMENT */}
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

        {isEmployed && (
          <div className="space-y-2 animate-in fade-in duration-300">
            <Label>Industry / Field</Label>
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
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
          <Label>Total Family Annual Income</Label>
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

      {/* SUBMIT */}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading || uploadProgress} className="h-12 px-8 text-lg">
          {uploadProgress ? "Uploading ID..." : loading ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 px-8 text-lg"
          onClick={() => window.history.back()}
        >
          Cancel
        </Button>
      </div>

      {success && (
        <p className="text-center text-green-600 font-medium p-3 bg-green-50 rounded-lg">
          ✓ Profile updated successfully!
        </p>
      )}

      {error && (
        <p className="text-center text-red-500 font-medium p-3 bg-red-50 rounded-lg">
          {error}
        </p>
      )}
    </form>
  );
}
