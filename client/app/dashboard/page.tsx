"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SignaturePad from "@/components/SignaturePad";
import { motion, AnimatePresence } from "framer-motion"; // Required for premium motion
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Loader2 } from "lucide-react";

type Role = "presenter" | "participant";

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } 
  },
};

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dob: "",
    agreed: false,
  });

  const isFormValid =
    form.agreed &&
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    signature !== "" &&
    (role === "presenter" || form.dob !== "");

  useEffect(() => {
    let mounted = true;

    async function checkAgreement() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || !mounted) {
        setLoading(false);
        return;
      }

      const userRole = user.user_metadata?.role;

      if (userRole !== "presenter" && userRole !== "participant") {
        setLoading(false);
        return;
      }

      setRole(userRole);

      const table = userRole === "presenter"
          ? "confidentiality_agreements_presenter"
          : "confidentiality_agreements";

      const { data, error } = await supabase
        .from(table)
        .select("agreed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setLoading(false);
        return;
      }

      if (data?.agreed) {
        router.replace(
          userRole === "presenter"
            ? "/dashboard/presenter/onboarding"
            : "/dashboard/participant"
        );
        return;
      }

      setLoading(false);
    }

    checkAgreement();
    return () => { mounted = false; };
  }, [router, supabase]);

  async function submit() {
    if (!isFormValid || submitting || !role) return;
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const payload = role === "presenter" 
      ? {
          user_id: user.id,
          agreed: true,
          agreed_at: new Date().toISOString(),
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          signature_data: signature,
        }
      : {
          user_id: user.id,
          agreed: true,
          first_name: form.firstName.trim(),
          middle_name: form.middleName.trim() || null,
          last_name: form.lastName.trim(),
          date_of_birth: form.dob,
          signature_data: signature,
        };

    const table = role === "presenter" ? "confidentiality_agreements_presenter" : "confidentiality_agreements";
    const { error } = await supabase.from(table).upsert(payload, { onConflict: "user_id" });

    if (error) {
      setSubmitting(false);
      return;
    }

    router.replace(role === "presenter" ? "/dashboard/presenter/onboarding" : "/dashboard/participant");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <motion.main 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-3xl mx-auto px-6 py-16 space-y-12"
    >
      {/* Header Section */}
      <motion.div variants={itemVariants} className="text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-2">
          <ShieldCheck className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-4xl font-light tracking-tight heading-display">
          {role === "presenter" ? "Presenter" : "Participant"} <span className="text-accent">Agreement</span>
        </h1>
        <p className="heading-elegant text-[10px] text-muted-foreground tracking-[0.2em]">
          Legal Confidentiality & Non-Disclosure
        </p>
      </motion.div>

      {/* Agreement Text Card */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-muted/50">
          <CardContent className="p-8 prose prose-sm max-w-none text-muted-foreground leading-relaxed">
            {role === "presenter" ? (
              <p>
                By signing this agreement, the presenter acknowledges that all
                materials, discussions, participant responses, and research outcomes
                associated with this focus group are strictly confidential. The
                presenter agrees not to record, distribute, disclose, or reuse any
                information obtained during the session outside the scope of this
                study.
              </p>
            ) : (
              <p>
                By signing the acknowledgement below, the participant understands
                that all discussions as part of the jury study will be for private
                use only. In exchange for payment, the participant agrees to keep all
                information confidential and acknowledges that he or she will be
                disqualified as a juror in any of the cases discussed.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Form Fields */}
      <motion.div variants={itemVariants} className="space-y-8">
        <div className="flex items-center space-x-3 bg-secondary/30 p-4 rounded-lg border border-accent/10">
          <Checkbox 
            id="agreed" 
            checked={form.agreed} 
            onCheckedChange={(checked) => setForm({ ...form, agreed: !!checked })}
            className="border-accent data-[state=checked]:bg-accent"
          />
          <Label htmlFor="agreed" className="text-sm font-medium cursor-pointer">
            I have read and agree to the terms of confidentiality.
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="heading-elegant text-[10px] text-accent">First Name</Label>
            <Input 
              value={form.firstName} 
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="bg-white/50 border-muted focus:border-accent transition-all"
            />
          </div>
          <div className="space-y-2">
            <Label className="heading-elegant text-[10px] text-muted-foreground">Middle (Optional)</Label>
            <Input 
              value={form.middleName} 
              onChange={(e) => setForm({ ...form, middleName: e.target.value })}
              className="bg-white/50 border-muted focus:border-accent transition-all"
            />
          </div>
          <div className="space-y-2">
            <Label className="heading-elegant text-[10px] text-accent">Last Name</Label>
            <Input 
              value={form.lastName} 
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="bg-white/50 border-muted focus:border-accent transition-all"
            />
          </div>
        </div>

        {role === "participant" && (
          <motion.div variants={itemVariants} className="max-w-xs space-y-2">
            <Label className="heading-elegant text-[10px] text-accent">Date of Birth</Label>
            <Input 
              type="date" 
              value={form.dob} 
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
              className="bg-white/50 border-muted"
            />
          </motion.div>
        )}
      </motion.div>

      {/* Signature Section */}
      <motion.div variants={itemVariants} className="space-y-4">
        <Label className="heading-elegant text-[10px] text-accent">Digital Signature</Label>
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-secondary/10 p-1">
          <SignaturePad onChange={setSignature} />
        </div>
        <p className="text-[10px] text-muted-foreground text-center italic">
          This digital signature represents a binding legal obligation.
        </p>
      </motion.div>

      {/* Submit Action */}
      <motion.div variants={itemVariants} className="pt-6">
        <Button 
          disabled={!isFormValid || submitting}
          onClick={submit}
          className="w-full h-14 bg-primary text-primary-foreground hover:shadow-xl transition-all rounded-full heading-elegant text-[11px]"
        >
          {submitting ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Processing...</span>
          ) : "Confirm & Enter Dashboard"}
        </Button>
      </motion.div>
    </motion.main>
  );
}