"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { motion, Variants } from "framer-motion";

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
// Removed unused Checkbox import to resolve ESLint error

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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const } 
  },
};

type Props = {
  userId: string;
};

export default function ParticipantForm({ userId }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State hooks
  const [gender, setGender] = useState("");
  const [race, setRace] = useState("");
  const [state, setState] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [politicalAffiliation, setPoliticalAffiliation] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [currentlyEmployed, setCurrentlyEmployed] = useState("");
  const [familyIncome, setFamilyIncome] = useState("");
  const [referralSource, setReferralSource] = useState("");

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

    const form = new FormData(e.currentTarget);
    const payload = {
      user_id: userId,
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      age: Number(form.get("age")),
      gender,
      race,
      state,
      education_level: educationLevel,
      marital_status: maritalStatus,
      currently_employed: currentlyEmployed,
      family_income: familyIncome,
      political_affiliation: politicalAffiliation,
      heard_about_us: referralSource,
      served_on_jury: servedOnJury,
      convicted_felon: convictedFelon,
      us_citizen: usCitizen,
      has_children: hasChildren,
      served_armed_forces: servedArmedForces,
      internet_access: internetAccess,
      entry_date: new Date().toISOString(),
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
    <motion.form 
      onSubmit={handleSubmit} 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl mx-auto space-y-12 p-6"
    >
      <motion.div variants={itemVariants} className="text-center space-y-3">
        <h2 className="text-4xl font-light tracking-tight heading-display">Participant Profile</h2>
        <p className="text-muted-foreground text-lg">Provide your details to be eligible for professional studies.</p>
      </motion.div>

      {/* Basic Info Section */}
      <motion.div variants={itemVariants} className="space-y-6">
        <h3 className="heading-elegant text-accent border-b pb-2">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input id="first_name" name="first_name" required className="bg-white/50 border-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input id="last_name" name="last_name" required className="bg-white/50 border-muted" />
          </div>
        </div>
      </motion.div>

      {/* Demographics Section */}
      <motion.div variants={itemVariants} className="space-y-6 pt-4">
        <h3 className="heading-elegant text-accent border-b pb-2">Demographics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Education Level</Label>
            <Select value={educationLevel} onValueChange={setEducationLevel} required>
              <SelectTrigger className="bg-white/50 border-muted"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="High School">High School</SelectItem>
                {/* Escaped apostrophes below resolve the ESLint error */}
                <SelectItem value="Associate Degree">Associate&apos;s Degree</SelectItem>
                <SelectItem value="Bachelor Degree">Bachelor&apos;s Degree</SelectItem>
                <SelectItem value="Graduate Degree">Graduate Degree</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Select value={state} onValueChange={setState} required>
              <SelectTrigger className="bg-white/50 border-muted"><SelectValue placeholder="Select State" /></SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* Eligibility Section */}
      <motion.div variants={itemVariants} className="space-y-6 pt-4">
        <h3 className="heading-elegant text-accent border-b pb-2">Eligibility Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {yesNoFields.map(({ label, value, setter }) => (
            <div key={label} className="space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              <Select value={value} onValueChange={setter} required>
                <SelectTrigger className="bg-white/50 border-muted"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="pt-10 flex flex-col items-center">
        <Button 
          type="submit" 
          disabled={loading} 
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xl transition-all rounded-full heading-elegant"
        >
          {loading ? "Saving Profile..." : "Submit Profile"}
        </Button>
        {error && <p className="mt-4 text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">{error}</p>}
      </motion.div>
    </motion.form>
  );
}