"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, sendRescheduleEmail, sendSessionCreatedEmail, sendSessionCompletedEmail, emailWrapper } from "@/lib/mail";
import { revalidatePath } from "next/cache";
import { localToUTC, localToUTCTime } from "@/lib/timezone";

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
  sessionDate?: string,
  timezone?: string
) {
  const supabase = await createClient();

  const tz = timezone || "UTC";
  const rows = cases.map((c) => ({
    session_id: sessionId,
    case_id: c.caseId,
    start_time: sessionDate ? localToUTCTime(sessionDate, c.start, tz) : c.start,
    end_time:   sessionDate ? localToUTCTime(sessionDate, c.end,   tz) : c.end,
  }));

  const { error } = await supabase.from("session_cases").insert(rows);
  if (error) throw error;

  // Compute and store admin_scheduled_at on each case
  // by combining session_date + case end_time
  if (sessionDate) {
    // Fetch current scheduled_at for all cases in one query
    const { data: existingCases } = await supabase
      .from("cases")
      .select("id, scheduled_at")
      .in("id", cases.map((c) => c.caseId));

    const scheduledAtMap = Object.fromEntries(
      (existingCases ?? []).map((c) => [c.id, c.scheduled_at as string | null])
    );

    for (const c of cases) {
      const adminScheduledAt = localToUTC(sessionDate, c.end, tz);
      const presenterScheduledAt = scheduledAtMap[c.caseId] ?? null;

      // If admin time differs from presenter's preferred time, reset status so
      // presenter must re-confirm via the notification popup
      const timesMatch =
        presenterScheduledAt !== null &&
        new Date(presenterScheduledAt).getTime() === new Date(adminScheduledAt).getTime();

      const updatePayload: Record<string, string | null> = {
        admin_scheduled_at: adminScheduledAt,
      };
      if (!timesMatch) {
        updatePayload.schedule_status = null;
      }

      await supabase
        .from("cases")
        .update(updatePayload)
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

  // Fetch case times for this session to include in emails
  const { data: sessionCaseRows } = await supabase
    .from("session_cases")
    .select("start_time, end_time")
    .eq("session_id", sessionId);

  const formatCentralTime = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  };

  let timeStr = "TBD";
  if (sessionCaseRows && sessionCaseRows.length > 0) {
    const starts = sessionCaseRows.map((r) => r.start_time).filter(Boolean).sort();
    const ends   = sessionCaseRows.map((r) => r.end_time).filter(Boolean).sort();
    if (starts.length && ends.length) {
      timeStr = `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`;
    }
  }

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
        subject: `Invitation: Texas Jury Study Session – ${dateStr}`,
        html: emailWrapper(`
          <script type="application/ld+json">
          {
            "@context": "http://schema.org",
            "@type": "Event",
            "name": "Texas Jury Study Session",
            "startDate": "${sessionDate || new Date().toISOString()}",
            "location": { "@type": "Place", "name": "Remote (Secure Zoom)", "address": "Online" },
            "potentialAction": [
              { "@type": "RsvpAction", "handler": { "@type": "HttpActionHandler", "url": "${acceptLink}" }, "attendance": "http://schema.org/RsvpResponseYes" },
              { "@type": "RsvpAction", "handler": { "@type": "HttpActionHandler", "url": "${declineLink}" }, "attendance": "http://schema.org/RsvpResponseNo" }
            ]
          }
          </script>

          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">You Have Been Invited</h2>
          <p style="margin:0 0 20px;font-size:15px;color:#475569;">
            You have been selected to participate in a Texas Jury Study focus group session. Please review the session details below and confirm your availability.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
            <tr>
              <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${dateStr}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 20px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Session Time</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${timeStr}</p>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 16px;font-size:14px;color:#475569;font-weight:600;">Please respond to this invitation:</p>

          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:12px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#16a34a;">
                      <a href="${acceptLink}"
                         style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                        Accept Invitation
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#ffffff;border:1px solid #dc2626;">
                      <a href="${declineLink}"
                         style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#dc2626;text-decoration:none;border-radius:6px;">
                        Decline
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:13px;color:#64748b;">
            You can also manage this invitation from your
            <a href="${appUrl}/dashboard/participant" style="color:#2563eb;text-decoration:underline;">participant dashboard</a>.
          </p>
        `),
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
   NOTIFY PRESENTERS SESSION CREATED
========================= */
export async function notifyPresentersSessionCreated(
  sessionId: string,
  caseIds: string[],
  sessionDate: string,
  participantCount: number
) {
  if (!caseIds.length) return;

  const supabase = await createClient();

  // Fetch case titles and presenter user_ids
  const { data: caseRows } = await supabase
    .from("cases")
    .select("id, title, user_id")
    .in("id", caseIds);

  if (!caseRows?.length) return;

  // Fetch session times
  const { data: sessionCaseRows } = await supabase
    .from("session_cases")
    .select("start_time, end_time")
    .eq("session_id", sessionId);

  const formatCentralTime = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  };

  let timeStr = "TBD";
  if (sessionCaseRows?.length) {
    const starts = sessionCaseRows.map((r) => r.start_time).filter(Boolean).sort();
    const ends   = sessionCaseRows.map((r) => r.end_time).filter(Boolean).sort();
    if (starts.length && ends.length) {
      timeStr = `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`;
    }
  }

  const dateStr = new Date(sessionDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Group case titles by presenter (one email per presenter)
  const presenterMap = new Map<string, string[]>();
  for (const c of caseRows) {
    if (!c.user_id) continue;
    if (!presenterMap.has(c.user_id)) presenterMap.set(c.user_id, []);
    presenterMap.get(c.user_id)!.push(c.title);
  }

  for (const [presenterId, titles] of presenterMap) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(presenterId);
      const email = userData?.user?.email;
      if (email) {
        await sendSessionCreatedEmail(email, titles, dateStr, timeStr, participantCount);
        console.log(`[notifyPresenters] Session created email sent to ${email}`);
      }
    } catch (e) {
      console.error(`[notifyPresenters] Failed to email presenter ${presenterId}:`, e);
    }
  }
}

/* =========================
   RESCHEDULE SESSION
========================= */
export async function rescheduleSession(
  sessionId: string,
  newDate: string, // "YYYY-MM-DD"
  caseUpdates: { caseId: string; start: string; end: string }[],
  timezone?: string
) {
  const supabase = await createClient();

  // 1. Update session date
  const { error: sessionError } = await supabase
    .from("sessions")
    .update({ session_date: newDate })
    .eq("id", sessionId);

  if (sessionError) throw sessionError;

  // 2. Update session_cases times + cases.admin_scheduled_at
  const tz = timezone || "UTC";
  for (const cu of caseUpdates) {
    const startUtc = localToUTCTime(newDate, cu.start.slice(0, 5), tz);
    const endUtc   = localToUTCTime(newDate, cu.end.slice(0, 5),   tz);

    await supabase
      .from("session_cases")
      .update({ start_time: startUtc, end_time: endUtc })
      .eq("session_id", sessionId)
      .eq("case_id", cu.caseId);

    if (endUtc && newDate) {
      const adminScheduledAt = localToUTC(newDate, cu.end.slice(0, 5), tz);
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

/* =========================
   REPLACE CASE IN SESSION
========================= */
export async function replaceCaseInSession(
  sessionId: string,
  oldCaseId: string,
  newCaseId: string,
  startTime: string,
  endTime: string,
  sessionDate: string
) {
  const supabase = await createClient();

  // 1. Remove old case from session
  await supabase
    .from("session_cases")
    .delete()
    .eq("session_id", sessionId)
    .eq("case_id", oldCaseId);

  // 2. Reset old case back to unscheduled state
  await supabase
    .from("cases")
    .update({ admin_scheduled_at: null, schedule_status: null })
    .eq("id", oldCaseId);

  // 3. Add new case to session with the same time slot
  await supabase
    .from("session_cases")
    .insert({ session_id: sessionId, case_id: newCaseId, start_time: startTime, end_time: endTime });

  // 4. Set admin_scheduled_at — endTime is already UTC (from session_cases)
  const endHHMM = endTime?.slice(0, 5);
  const adminScheduledAt = new Date(`${sessionDate}T${endHHMM}:00Z`).toISOString();
  await supabase
    .from("cases")
    .update({ admin_scheduled_at: adminScheduledAt, schedule_status: null })
    .eq("id", newCaseId);

  // 5. Notify new presenter — same as rescheduleSession
  const newDateStr = new Date(sessionDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { data: caseRow } = await supabase
    .from("cases")
    .select("user_id")
    .eq("id", newCaseId)
    .single();

  if (caseRow?.user_id) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(caseRow.user_id);
      if (userData?.user?.email) {
        await sendRescheduleEmail(userData.user.email, newDateStr, "presenter");
      }
    } catch (e) {
      console.error(`Notification email failed for new presenter ${caseRow.user_id}:`, e);
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   TOGGLE COMPLETION EMAIL INTENT
   Sets send_completion_email on a session (pre-select intent before session completes)
========================= */
export async function toggleCompletionEmailIntent(sessionId: string, value: boolean) {
  const supabase = await createClient();
  await supabase
    .from("sessions")
    .update({ send_completion_email: value })
    .eq("id", sessionId);
  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   SEND SESSION COMPLETION EMAIL
   Sends completion email to each case presenter and marks completion_email_sent = true
========================= */
export async function sendCompletionEmailAction(sessionId: string) {
  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("session_date, completion_email_sent")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    console.error("[sendCompletionEmail] Failed to fetch session:", sessionError);
    return;
  }

  // Guard: only send once
  if ((session as any).completion_email_sent) {
    console.log("[sendCompletionEmail] Already sent for session:", sessionId);
    return;
  }

  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const caseIds = (sessionCases ?? []).map((sc: any) => sc.case_id);
  if (!caseIds.length) {
    console.error("[sendCompletionEmail] No cases found for session:", sessionId);
    return;
  }

  const { data: caseRows } = await supabase
    .from("cases")
    .select("id, title, user_id")
    .in("id", caseIds);

  if (!caseRows?.length) {
    console.error("[sendCompletionEmail] No case rows found");
    return;
  }

  const sessionDate = new Date(session.session_date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Deduplicate by user_id — same pattern as notifyPresentersSessionCreated
  const presenterMap = new Map<string, string[]>();
  for (const c of caseRows) {
    if (!c.user_id) continue;
    if (!presenterMap.has(c.user_id)) presenterMap.set(c.user_id, []);
    presenterMap.get(c.user_id)!.push(c.title);
  }

  if (presenterMap.size === 0) {
    console.error("[sendCompletionEmail] No user_id on cases:", caseIds);
    return;
  }

  for (const [userId, titles] of presenterMap) {
    try {
      // Primary: auth.users  (same as approveCaseAction)
      let email: string | null = null;
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = userData?.user?.email ?? null;

      // Fallback: profiles table
      if (!email) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", userId)
          .single();
        email = profile?.email ?? null;
      }

      if (email) {
        await sendSessionCompletedEmail(email, titles, sessionDate);
        console.log(`[sendCompletionEmail] Sent to ${email}`);
      } else {
        console.error(`[sendCompletionEmail] No email found for user_id ${userId}`);
      }
    } catch (e) {
      console.error(`[sendCompletionEmail] Failed for user_id ${userId}:`, e);
    }
  }

  await supabase
    .from("sessions")
    .update({ completion_email_sent: true } as any)
    .eq("id", sessionId);

  revalidatePath("/dashboard/Admin/sessions");
}
