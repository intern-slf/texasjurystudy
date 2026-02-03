import { redirect } from "next/navigation";
import ParticipantForm from "@/components/ParticipantForm";
import { createClient } from "@/lib/supabase/server";

export default async function ParticipantDashboard() {
  // ✅ IMPORTANT: await the client
  const supabase = await createClient();

  // 1️⃣ Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // 2️⃣ ROLE GATE — presenters must never see this page
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

  // 4️⃣ If submitted → confirmation UI
  if (submission) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-2xl font-semibold">
          Participant Dashboard
        </h1>

        <p className="mt-4 text-muted-foreground">
          Your profile has been submitted. You will be notified if you
          are selected for a focus group session.
        </p>
      </main>
    );
  }

  // 5️⃣ Otherwise → show the participant form
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="text-2xl font-semibold mb-6">
        Juror Information Form
      </h1>

      <ParticipantForm userId={user.id} />
    </main>
  );
}
