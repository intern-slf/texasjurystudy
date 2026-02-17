"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mail";
import { revalidatePath } from "next/cache";

/* =========================
   CREATE SESSION
========================= */
export async function createSession(sessionDate: string) {
  const supabase = await createClient();
  // who is creating
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      session_date: sessionDate,
      created_by: user.id,   // ✅ THE FIX
    })
    .select()
    .single();

  if (error) throw error;

  return data.id;
}

/* =========================
   ATTACH CASES
========================= */
export async function addCasesToSession(
  sessionId: string,
  cases: { caseId: string; start: string; end: string }[]
) {
  const supabase = await createClient();

  const rows = cases.map((c) => ({
    session_id: sessionId,
    case_id: c.caseId,
    start_time: c.start,
    end_time: c.end,
  }));

  const { error } = await supabase.from("session_cases").insert(rows);
  if (error) throw error;
}

/* =========================
   INVITE PARTICIPANTS
========================= */
export async function inviteParticipants(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
) {
  const supabase = await createClient();

  const rows = participantIds.map((id) => ({
    session_id: sessionId,
    participant_id: id,
  }));

  const { error } = await supabase
    .from("session_participants")
    .insert(rows);

  if (error) throw error;

  // Send invitation emails to each participant
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  for (const participantId of participantIds) {
    try {
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.admin.getUserById(participantId);

      if (userError || !userData?.user?.email) {
        console.error(
          `Could not get email for participant ${participantId}:`,
          userError?.message || "No email found"
        );
        continue;
      }

      const participantEmail = userData.user.email;
      const dateStr = sessionDate
        ? new Date(sessionDate).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "TBD";

      await sendEmail({
        to: participantEmail,
        subject: "You've been invited to a Jury Study Session!",
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px; max-width: 500px;">
            <h2 style="color: #2563eb;">Session Invitation</h2>
            <p>You have been invited to participate in a <strong>Texas Jury Study</strong> session.</p>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p>Please log in to your dashboard to review and respond to the invitation.</p>
            <div style="margin-top: 20px;">
              <a href="${appUrl}/dashboard/participant"
                 style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; display: inline-block;">
                View Invitation
              </a>
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #999;">If you did not expect this email, please ignore it.</p>
          </div>
        `,
      });

      console.log(`Invitation email sent to ${participantEmail}`);
    } catch (emailError) {
      console.error(
        `Failed to send invite email to participant ${participantId}:`,
        emailError
      );
      // Don't throw — we still want the invite record saved even if email fails
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   PARTICIPANT RESPONSE
========================= */
export async function respondToInvite(
  sessionId: string,
  participantId: string,
  status: "accepted" | "rejected"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("session_participants")
    .update({
      invite_status: status,
      responded_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);

  if (error) throw error;
}
