"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, sendRescheduleEmail } from "@/lib/mail";
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
  cases: { caseId: string; start: string; end: string }[],
  sessionDate?: string
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

  // Compute and store admin_scheduled_at on each case
  // by combining session_date + case end_time
  if (sessionDate) {
    for (const c of cases) {
      // sessionDate is "YYYY-MM-DD", c.end is "HH:MM"
      const adminScheduledAt = new Date(`${sessionDate}T${c.end}:00`).toISOString();

      await supabase
        .from("cases")
        .update({ admin_scheduled_at: adminScheduledAt })
        .eq("id", c.caseId);
    }
  }
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

  const { data: insertedRows, error } = await supabase
    .from("session_participants")
    .insert(rows)
    .select();

  if (error) throw error;

  // Send invitation emails to each participant
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const row of (insertedRows || [])) {
    const participantId = row.participant_id;
    const inviteRecordId = row.id;

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

      const acceptLink = `${appUrl}/dashboard/participant?inviteId=${inviteRecordId}&status=accepted`;
      const declineLink = `${appUrl}/dashboard/participant?inviteId=${inviteRecordId}&status=declined`;


      await sendEmail({
        to: participantEmail,
        subject: "You've been invited to a Jury Study Session!",
        html: `
          <html>
            <head>
              <script type="application/ld+json">
              {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "Jury Study Session",
                "startDate": "${sessionDate || new Date().toISOString()}",
                "location": {
                  "@type": "Place",
                  "name": "Remote (Secure Zoom)",
                  "address": "Online"
                },
                "potentialAction": [
                  {
                    "@type": "RsvpAction",
                    "handler": {
                      "@type": "HttpActionHandler",
                      "url": "${acceptLink}"
                    },
                    "attendance": "http://schema.org/RsvpResponseYes"
                  },
                  {
                    "@type": "RsvpAction",
                    "handler": {
                      "@type": "HttpActionHandler",
                      "url": "${declineLink}"
                    },
                    "attendance": "http://schema.org/RsvpResponseNo"
                  }
                ]
              }
              </script>
            </head>
            <body style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
              <div style="border: 1px solid #eee; border-radius: 12px; max-width: 550px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <h2 style="color: #2563eb; margin-top: 0; font-size: 24px;">Session Invitation</h2>
                <p style="font-size: 16px;">You have been invited to participate in a <strong>Texas Jury Study</strong> focus group session.</p>
                
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Session Date</p>
                  <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 600;">${dateStr}</p>
                </div>

                <p style="font-size: 15px; color: #64748b;">Please respond by selecting an option below:</p>
                
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-top: 20px; width: 100%;">
                  <tr>
                    <td align="center">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding: 0 5px;">
                            <a href="${acceptLink}"
                               style="background-color: #16a34a; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 14px;">
                              Yes
                            </a>
                          </td>
                          <td style="padding: 0 5px;">
                            <a href="${declineLink}"
                               style="background-color: #dc2626; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 14px;">
                              No
                            </a>
                          </td>

                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
                  <p style="font-size: 14px; color: #64748b;">Alternatively, <a href="${appUrl}/dashboard/participant" style="color: #2563eb; text-decoration: underline;">view invitation on your dashboard</a>.</p>
                </div>
                
                <p style="margin-top: 25px; font-size: 12px; color: #94a3b8; text-align: center;">If you did not expect this email, please ignore it.</p>
              </div>
            </body>
          </html>
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
   RESCHEDULE SESSION
========================= */
export async function rescheduleSession(
  sessionId: string,
  newDate: string, // "YYYY-MM-DD"
  caseUpdates: { caseId: string; start: string; end: string }[]
) {
  const supabase = await createClient();

  // 1. Update session date
  const { error: sessionError } = await supabase
    .from("sessions")
    .update({ session_date: newDate })
    .eq("id", sessionId);

  if (sessionError) throw sessionError;

  // 2. Update session_cases times + cases.admin_scheduled_at
  for (const cu of caseUpdates) {
    await supabase
      .from("session_cases")
      .update({ start_time: cu.start, end_time: cu.end })
      .eq("session_id", sessionId)
      .eq("case_id", cu.caseId);

    const endHHMM = cu.end?.slice(0, 5); // guard against "HH:MM:SS" from Postgres
    if (endHHMM && newDate) {
      const adminScheduledAt = new Date(`${newDate}T${endHHMM}:00`).toISOString();
      await supabase
        .from("cases")
        .update({ admin_scheduled_at: adminScheduledAt })
        .eq("id", cu.caseId);
    }
  }

  // Reset schedule_status so presenter must re-confirm the new date
  if (caseUpdates.length) {
    await supabase
      .from("cases")
      .update({ schedule_status: null })
      .in("id", caseUpdates.map((cu) => cu.caseId));
  }

  // Human-readable date for emails
  const newDateStr = new Date(newDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 3. Notify accepted participants
  const { data: acceptedRows } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  for (const row of acceptedRows ?? []) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        row.participant_id
      );
      if (userData?.user?.email) {
        await sendRescheduleEmail(userData.user.email, newDateStr, "participant");
      }
    } catch (e) {
      console.error(`Reschedule email failed for participant ${row.participant_id}:`, e);
    }
  }

  // 4. Notify presenter(s) — deduplicated by user_id
  const caseIds = caseUpdates.map((cu) => cu.caseId);
  if (caseIds.length) {
    const { data: caseRows } = await supabase
      .from("cases")
      .select("user_id")
      .in("id", caseIds);

    const uniquePresenterIds = Array.from(
      new Set((caseRows ?? []).map((c) => c.user_id).filter(Boolean))
    );

    for (const presenterId of uniquePresenterIds) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(presenterId);
        if (userData?.user?.email) {
          await sendRescheduleEmail(userData.user.email, newDateStr, "presenter");
        }
      } catch (e) {
        console.error(`Reschedule email failed for presenter ${presenterId}:`, e);
      }
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


