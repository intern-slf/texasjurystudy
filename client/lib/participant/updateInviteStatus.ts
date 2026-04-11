"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendInviteAcceptedConfirmationEmail, sendInviteDeclinedConfirmationEmail, sendSessionFullEmail } from "@/lib/mail";

/* =========================
   CHECK IF SESSION HAS REACHED ITS PARTICIPANT CAP
========================= */
export async function isSessionFull(sessionId: string): Promise<boolean> {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("participant_cap")
    .eq("id", sessionId)
    .single();

  const cap = session?.participant_cap ?? 10;

  const { count } = await supabaseAdmin
    .from("session_participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  return (count ?? 0) >= cap;
}

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  console.log(`[updateInviteStatus] Updating ${sessionParticipantId} to ${status}`);

  // 0. If accepting, check if session is already full
  if (status === "accepted") {
    const { data: inviteRow } = await supabaseAdmin
      .from("session_participants")
      .select("session_id")
      .eq("id", sessionParticipantId)
      .single();

    if (inviteRow) {
      const isFull = await isSessionFull(inviteRow.session_id);
      if (isFull) {
        return { blocked: true, reason: "session_full" } as const;
      }
    }
  }

  // 1. Update invite status in session_participants and get the row back
  const { data: updatedRows, error } = await supabaseAdmin
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("id", sessionParticipantId)
    .select("session_id, participant_id");

  if (error) {
    console.error(`[updateInviteStatus] Error:`, error.message);
    throw new Error(error.message);
  }

  console.log(`[updateInviteStatus] Success:`, updatedRows);

  if (!updatedRows?.length) return;
  const { session_id, participant_id } = updatedRows[0];

  // 2. Only set cooldown + send accepted email when participant ACCEPTS
  if (status === "accepted") {
    try {
      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("session_date")
        .eq("id", session_id)
        .single();

      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("start_time, end_time")
        .eq("session_id", session_id);

      if (!session || !sessionCases?.length) return;

      const latestEndTime = sessionCases
        .map((sc) => sc.end_time as string)
        .sort((a, b) => a.localeCompare(b))
        .at(-1)!;

      const sessionDateStr = (session.session_date as string).split("T")[0];

      // Treat session date + end time as local time (admin enters local time)
      const eligibleDate = new Date(`${sessionDateStr}T${latestEndTime}`);

      eligibleDate.setDate(eligibleDate.getDate() + 1);

      const eligibleAfterAt = eligibleDate.toISOString();

      console.log("Cooldown set to:", eligibleAfterAt);

      const { error: cooldownErr } = await supabaseAdmin
        .from("jury_participants")
        .update({ eligible_after_at: eligibleAfterAt })
        .eq("user_id", participant_id);

      if (cooldownErr) {
        console.error("Cooldown update failed:", cooldownErr.message);
      }

      // Send acceptance confirmation email
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participant_id);
        const email = userData?.user?.email;
        if (email) {
          const firstCase = sessionCases[0];
          const timeStr = firstCase ? `${firstCase.start_time} – ${firstCase.end_time}` : "See your dashboard for details";
          await sendInviteAcceptedConfirmationEmail(email, session.session_date as string, timeStr);
        }
      } catch (emailErr) {
        console.error("[updateInviteStatus] Failed to send acceptance email:", emailErr);
      }
    } catch (err) {
      console.error("Cooldown computation error:", err);
    }

    // Check if session is now full and notify pending participants
    try {
      await checkAndNotifySessionFull(session_id);
    } catch (err) {
      console.error("[updateInviteStatus] Session full check error:", err);
    }
  }

  // 3. Send declined confirmation email
  if (status === "declined") {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participant_id);
      const email = userData?.user?.email;
      if (email) {
        await sendInviteDeclinedConfirmationEmail(email);
      }
    } catch (emailErr) {
      console.error("[updateInviteStatus] Failed to send decline email:", emailErr);
    }
  }
}

/* =========================
   CHECK IF SESSION IS FULL & NOTIFY PENDING PARTICIPANTS
========================= */
export async function checkAndNotifySessionFull(sessionId: string) {
  // 1. Get session info including cap and notification flag
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("session_date, participant_cap, session_full_notified")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  const cap = session.participant_cap ?? 10; // default 10
  if (session.session_full_notified) return; // already notified

  // 2. Count accepted participants
  const { count: acceptedCount } = await supabaseAdmin
    .from("session_participants")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  if ((acceptedCount ?? 0) < cap) return; // not full yet

  // 3. Get pending participants (haven't responded — status is "pending" or null)
  const { data: pendingRows } = await supabaseAdmin
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId)
    .not("invite_status", "in", '("accepted","declined","rejected")');

  if (!pendingRows?.length) {
    // No pending participants, just mark as notified
    await supabaseAdmin
      .from("sessions")
      .update({ session_full_notified: true })
      .eq("id", sessionId);
    return;
  }

  const sessionDateStr = new Date(session.session_date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 4. Send session full email to each pending participant
  for (const row of pendingRows) {
    try {
      // Try jury_participants first, then oldData
      let email: string | null = null;
      let firstName = "there";

      const { data: jp } = await supabaseAdmin
        .from("jury_participants")
        .select("email, first_name")
        .eq("user_id", row.participant_id)
        .maybeSingle();

      if (jp) {
        email = jp.email;
        firstName = jp.first_name || "there";
      } else {
        const { data: od } = await supabaseAdmin
          .from("oldData")
          .select("email, first_name")
          .eq("id", row.participant_id)
          .maybeSingle();
        if (od) {
          email = od.email;
          firstName = od.first_name || "there";
        }
      }

      if (email) {
        await sendSessionFullEmail(email, firstName, sessionDateStr);
        console.log(`[sessionFull] Sent session full email to ${email}`);
      }

      // Mark their invite as declined since session is full
      await supabaseAdmin
        .from("session_participants")
        .update({ invite_status: "declined", responded_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("participant_id", row.participant_id);
    } catch (err) {
      console.error(`[sessionFull] Failed for participant ${row.participant_id}:`, err);
    }
  }

  // 5. Mark session as notified so we don't send again
  await supabaseAdmin
    .from("sessions")
    .update({ session_full_notified: true })
    .eq("id", sessionId);

  console.log(`[sessionFull] Session ${sessionId} is full (${acceptedCount}/${cap}). Notified ${pendingRows.length} pending participants.`);
}
