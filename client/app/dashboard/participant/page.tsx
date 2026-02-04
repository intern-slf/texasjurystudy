import { redirect } from "next/navigation";
import ParticipantForm from "@/components/ParticipantForm";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox, CheckCircle2 } from "lucide-react";

export default async function ParticipantDashboard() {
  const supabase = await createClient();

  // 1️⃣ Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // 2️⃣ ROLE GATE
  const role = user.user_metadata?.role;
  if (role === "presenter") {
    redirect("/dashboard/presenter");
  }

  // 3️⃣ Check if participant already submitted form
  const { data: submission } = await supabase
    .from("jury_participants")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // 4️⃣ If submitted → Show Premium Confirmation UI
  if (submission) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-20 animate-fade-in">
        <div className="text-center space-y-4 mb-12">
          <p className="heading-elegant text-accent">Status: Complete</p>
          <h1 className="text-4xl font-light heading-display">Participant Dashboard</h1>
        </div>

        <Card className="glass-card border-accent/20 overflow-hidden">
          <CardContent className="p-12 flex flex-col items-center text-center space-y-6">
            <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-accent" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-light heading-display">Profile Under Review</h2>
              <p className="max-w-md text-muted-foreground leading-relaxed">
                Your professional profile has been successfully submitted. Our matching 
                engine is currently pairing your demographics with active jury studies.
              </p>
            </div>
            <div className="pt-4 flex items-center gap-2 text-xs heading-elegant text-accent/60 tracking-widest">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              Monitoring for Matches
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 5️⃣ Otherwise → show the animated Juror Information Form
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 animate-slide-up">
      <div className="text-center space-y-3 mb-12">
        <p className="heading-elegant text-accent">Requirement</p>
        <h1 className="text-4xl font-light heading-display">Juror Information Form</h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Please provide accurate details to ensure you are matched with the most relevant focus groups.
        </p>
      </div>

      <ParticipantForm userId={user.id} />
    </main>
  );
}