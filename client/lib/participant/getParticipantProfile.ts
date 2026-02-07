import { createClient } from "@/lib/supabase/server";

export async function getParticipantProfile(
  requestedId: string,
  context?: { from?: string; caseId?: string }
) {
  const supabase = await createClient();

  /* =========================
     AUTH USER
     ========================= */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  /* =========================
     ROLE
     ========================= */
  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!roleRow) throw new Error("Role not found");

  const role = roleRow.role;

  /* =========================
     PARTICIPANT SELF VIEW
     ========================= */
  let finalParticipantId = requestedId;

  if (role === "participant") {
    const { data: self } = await supabase
      .from("jury_participants")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!self) throw new Error("Participant record not found");

    finalParticipantId = self.id;
  }

  /* =========================
     PRESENTER / REVIEWER LIMIT
     ========================= */
  if (role === "presenter" || role === "reviewer") {
    if (!context?.caseId) {
      throw new Error("Case context required");
    }

    const { data: caseRow } = await supabase
      .from("cases")
      .select("presenter_id")
      .eq("id", context.caseId)
      .single();

    if (!caseRow || caseRow.presenter_id !== user.id) {
      throw new Error("Access denied");
    }

    // No participant mapping table yet,
    // so if they came from their case → allow.
  }

  /* =========================
     FETCH PARTICIPANT
     ========================= */
  const { data: participant } = await supabase
    .from("jury_participants")
    .select("*")
    .eq("id", finalParticipantId)
    .single();

  if (!participant) throw new Error("Participant not found");

  return {
    participant,
    role,
  };
}
