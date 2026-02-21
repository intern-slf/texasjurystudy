import { createClient } from "@/lib/supabase/server";

export async function getParticipantProfile(
  requestedId: string,
  context?: { from?: string; caseId?: string; testTable?: string }
) {
  const supabase = await createClient();
  const testTable = context?.testTable || "jury_participants";

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

  const role = roleRow?.role || user.user_metadata?.role || "participant";

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

    if (!self) {
      return {
        participant: null,
        role,
      };
    }

    finalParticipantId = self.id;


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
  // Default to jury_participants unless specifically testing oldData
  let targetTable = context?.testTable === "oldData" ? "oldData" : "jury_participants";

  let { data: participant } = await supabase
    .from(targetTable)
    .select("*")
    .eq("id", finalParticipantId)
    .single();

  // FALLBACK 1: If not found by UUID pk, try looking up by user_id field
  if (!participant) {
    const { data: fallbackParticipant } = await supabase
      .from(targetTable)
      .select("*")
      .eq("user_id", finalParticipantId)
      .single();
    
    if (fallbackParticipant) {
      participant = fallbackParticipant;
    }
  }

  // FALLBACK 2: If still not found and no specific table was requested, try the OTHER table
  if (!participant && !context?.testTable) {
    const altTable = targetTable === "jury_participants" ? "oldData" : "jury_participants";
    const { data: altPart } = await supabase
      .from(altTable)
      .select("*")
      .eq("id", finalParticipantId)
      .single();
    
    if (altPart) {
      participant = altPart;
    } else {
      const { data: altFallback } = await supabase
        .from(altTable)
        .select("*")
        .eq("user_id", finalParticipantId)
        .single();
      if (altFallback) participant = altFallback;
    }
  }

  if (!participant) {
    return {
      participant: null,
      role,
    };
  }

  return {
    participant,
    role,
  };
}
