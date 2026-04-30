"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, sendRescheduleEmail, sendSessionCreatedEmail, sendSessionCompletedEmail, sendPresenceConfirmedEmail, sendPresenceDeclinedEmail, sendZoomLinkEmail, sendPresenterInfoEmail, emailWrapper } from "@/lib/mail";
import type { PresenterParticipantInfo } from "@/lib/mail";
import { checkAndNotifySessionFull } from "@/lib/participant/updateInviteStatus";
import { generateEmailActionToken } from "@/lib/emailActionToken";
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
    invite_status: "pending",
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
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

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

      const secret = process.env.EMAIL_ACTION_SECRET!;
      const acceptToken = generateEmailActionToken(inviteRecordId, "accepted", secret);
      const declineToken = generateEmailActionToken(inviteRecordId, "declined", secret);
      const acceptLink = `${appUrl}/api/email-action?token=${acceptToken}`;
      const declineLink = `${appUrl}/api/email-action?token=${declineToken}`;


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
  revalidatePath("/dashboard/participant/sessions");
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
   ADMIN RESPOND ON BEHALF OF PARTICIPANT
========================= */
export async function adminRespondOnBehalf(
  sessionId: string,
  participantId: string,
  action: "accepted" | "rejected"
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("session_participants")
    .update({ invite_status: action, responded_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);

  if (error) throw error;

  // Lookup participant email + name (same for both actions)
  let email: string | null = null;
  let firstName = "there";

  const { data: jp } = await supabase
    .from("jury_participants")
    .select("email, first_name")
    .eq("user_id", participantId)
    .maybeSingle();

  if (jp) {
    email = jp.email;
    firstName = jp.first_name || "there";
  } else {
    const { data: od } = await supabase
      .from("oldData")
      .select("email, first_name")
      .eq("id", participantId)
      .maybeSingle();
    if (od) {
      email = od.email;
      firstName = od.first_name || "there";
    }
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, zoom_link")
    .eq("id", sessionId)
    .single();

  if (email && session) {
    if (action === "accepted") {
      const { data: sc } = await supabase
        .from("session_cases")
        .select("start_time, end_time")
        .eq("session_id", sessionId)
        .limit(1)
        .maybeSingle();

      const timeStr = sc
        ? `${sc.start_time} – ${sc.end_time}`
        : "See your dashboard for details";

      await sendPresenceConfirmedEmail(email, firstName, session.session_date, timeStr);

      // If zoom link is already saved, send it immediately to the accepted participant
      if (session.zoom_link) {
        const formatCentralTime = (t: string) => {
          const [h, m] = t.split(":");
          const d = new Date();
          d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
          return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
        };

        const { data: sessionCaseRows } = await supabase
          .from("session_cases")
          .select("start_time, end_time")
          .eq("session_id", sessionId);

        let zoomTimeStr: string | undefined;
        if (sessionCaseRows && sessionCaseRows.length > 0) {
          const starts = sessionCaseRows.map((r) => r.start_time).filter(Boolean).sort();
          const ends = sessionCaseRows.map((r) => r.end_time).filter(Boolean).sort();
          if (starts.length && ends.length) {
            zoomTimeStr = `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`;
          }
        }

        await sendZoomLinkEmail(email, firstName, session.session_date, session.zoom_link, zoomTimeStr);
        console.log(`[adminRespondOnBehalf] Sent zoom link email to ${email} (link already saved)`);
      }
    } else {
      await sendPresenceDeclinedEmail(email, firstName, session.session_date);
    }
  }

  // Check if session is now full after admin acceptance
  if (action === "accepted") {
    try {
      await checkAndNotifySessionFull(sessionId);
    } catch (err) {
      console.error("[adminRespondOnBehalf] Session full check error:", err);
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   UPDATE SESSION PARTICIPANT CAP
========================= */
export async function updateSessionParticipantCap(
  sessionId: string,
  cap: number
) {
  // Use admin client to bypass RLS for these new columns
  const { error } = await supabaseAdmin
    .from("sessions")
    .update({ participant_cap: cap, session_full_notified: false })
    .eq("id", sessionId);

  if (error) throw error;

  // Re-run the session full check — if cap was lowered below current accepted count,
  // this will decline pending participants and send them emails
  try {
    await checkAndNotifySessionFull(sessionId);
  } catch (err) {
    console.error("[updateSessionParticipantCap] Session full check error:", err);
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   SET COMPLETION NOTIFICATION FLAG (upcoming sessions — cron handles sending)
========================= */
export async function setCompletionFlag(formData: FormData) {
  const supabase = await createClient();
  const sessionId = formData.get("sessionId") as string;

  const { error } = await supabase
    .from("sessions")
    .update({ completion_notification_enabled: true })
    .eq("id", sessionId);

  if (error) throw error;

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   SEND COMPLETION EMAIL NOW (past sessions — immediate send)
========================= */
export async function sendCompletionNow(formData: FormData) {
  const supabase = await createClient();
  const sessionId = formData.get("sessionId") as string;

  // Fetch session date
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Fetch cases for this session
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const caseIds = (sessionCases ?? []).map((sc) => sc.case_id);

  const { data: caseRows } = caseIds.length
    ? await supabase.from("cases").select("id, title, user_id").in("id", caseIds)
    : { data: [] };

  const sessionDateStr = new Date(session.session_date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Group case titles by presenter
  const presenterMap = new Map<string, string[]>();
  for (const c of (caseRows ?? [])) {
    if (!c.user_id) continue;
    if (!presenterMap.has(c.user_id)) presenterMap.set(c.user_id, []);
    presenterMap.get(c.user_id)!.push(c.title);
  }

  // Send email immediately to each presenter
  for (const [presenterId, titles] of presenterMap) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(presenterId);
      const email = userData?.user?.email;
      if (email) {
        await sendSessionCompletedEmail(email, titles, sessionDateStr);
        console.log(`[sendCompletionNow] Sent to ${email} for session ${sessionId}`);
      }
    } catch (e) {
      console.error(`[sendCompletionNow] Failed for presenter ${presenterId}:`, e);
    }
  }

  // Mark both flags so button goes gray and cron won't re-send
  await supabase
    .from("sessions")
    .update({ completion_notification_enabled: true, completion_email_sent: true })
    .eq("id", sessionId);

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   SEND ZOOM LINK TO ACCEPTED PARTICIPANTS
========================= */
export async function sendZoomLink(formData: FormData) {
  const supabase = await createClient();
  const sessionId = formData.get("sessionId") as string;
  const zoomLink = (formData.get("zoomLink") as string)?.trim();

  if (!zoomLink) throw new Error("Zoom link is required");

  // Fetch session date
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");
  const sessionDate = session.session_date as string;

  // Fetch session case times to include in email
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

  let timeStr: string | undefined;
  if (sessionCaseRows && sessionCaseRows.length > 0) {
    const starts = sessionCaseRows.map((r) => r.start_time).filter(Boolean).sort();
    const ends   = sessionCaseRows.map((r) => r.end_time).filter(Boolean).sort();
    if (starts.length && ends.length) {
      timeStr = `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`;
    }
  }

  // Fetch accepted participants
  const { data: participants } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  if (!participants?.length) return;

  // Send email to each accepted participant
  for (const p of participants) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(p.participant_id);
      const email = userData?.user?.email;
      const firstName =
        userData?.user?.user_metadata?.first_name ||
        userData?.user?.user_metadata?.full_name?.split(" ")[0] ||
        "Participant";

      if (email) {
        await sendZoomLinkEmail(email, firstName, sessionDate, zoomLink, timeStr);
      }
    } catch (e) {
      console.error(`[sendZoomLink] Failed for participant ${p.participant_id}:`, e);
    }
  }

  // Persist the zoom link on the session row
  await supabase.from("sessions").update({ zoom_link: zoomLink }).eq("id", sessionId);

  revalidatePath("/dashboard/Admin/sessions");
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
   SEARCH ELIGIBLE PARTICIPANTS
   Excludes: blocked, ineligible (eligible_after_at), already invited to this session
========================= */
export async function searchEligibleParticipants(
  sessionId: string,
  query: string,
) {
  const supabase = await createClient();

  // 1. Get already-invited participant IDs for this session
  const { data: sessionParts } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId);
  const alreadyInvitedIds = (sessionParts ?? []).map((p: any) => p.participant_id);

  // 2. Get blacklisted user IDs from roles table
  const { data: blacklistedRoles } = await supabase
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: any) => r.user_id as string);

  // Combine all IDs to exclude
  const excludeIds = Array.from(new Set([...alreadyInvitedIds, ...blacklistedIds]));

  const { count } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true });
  const testTable = count === 0 || count === null ? "oldData" : "jury_participants";
  const isOldData = testTable === "oldData";

  const nowIso = new Date().toISOString();

  let q = supabase.from(testTable).select("*");

  if (!isOldData) {
    q = q
      .or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`)
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null);
  }

  if (excludeIds.length > 0) {
    const idField = isOldData ? "id" : "user_id";
    // @ts-ignore
    q = q.not(idField, "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
  }

  // Search by name
  if (query.trim()) {
    const term = query.trim().toLowerCase();
    q = q.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%`
    );
  }

  // @ts-ignore
  const { data, error } = await q.limit(50);

  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.user_id || p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    city: p.city,
    date_of_birth: p.date_of_birth,
    political_affiliation: p.political_affiliation,
  }));
}

/* =========================
   NOTIFY PRESENTER BY EMAIL
   Sends zoom link, drive links, and accepted participant demographics
========================= */
export async function notifyPresenterByEmail(
  sessionId: string,
  presenterEmail: string,
) {
  const supabase = await createClient();

  // 1. Fetch session (zoom link, date)
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, zoom_link")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  const sessionDateStr = new Date(session.session_date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // 2. Fetch case IDs for session
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const caseIds = (sessionCases ?? []).map((sc) => sc.case_id);

  // 3. Fetch case titles and legacy drive_link field
  let caseTitleMap = new Map<string, string>();
  let legacyDriveLinkMap = new Map<string, string>();
  if (caseIds.length) {
    const { data: caseRows } = await supabase
      .from("cases")
      .select("id, title, drive_link")
      .in("id", caseIds);
    for (const c of caseRows ?? []) {
      caseTitleMap.set(c.id, c.title);
      if (c.drive_link) legacyDriveLinkMap.set(c.id, c.drive_link);
    }
  }

  // 4. Fetch Google Drive links for each case (case_drive_links table + legacy drive_link field)
  const driveLinks: { caseTitle: string; urls: string[] }[] = [];
  for (const caseId of caseIds) {
    const { data: links } = await supabase
      .from("case_drive_links")
      .select("url")
      .eq("case_id", caseId);

    const urls = (links ?? []).map((l) => l.url);

    // Include legacy drive_link from cases table if not already in case_drive_links
    const legacyLink = legacyDriveLinkMap.get(caseId);
    if (legacyLink && !urls.includes(legacyLink)) {
      urls.unshift(legacyLink);
    }

    if (urls.length > 0) {
      driveLinks.push({
        caseTitle: caseTitleMap.get(caseId) ?? "Unknown Case",
        urls,
      });
    }
  }

  // 5. Fetch accepted participants with demographics
  const { data: acceptedRows } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  const acceptedIds = (acceptedRows ?? []).map((r) => r.participant_id);

  const participants: PresenterParticipantInfo[] = [];
  if (acceptedIds.length) {
    const { data: juryData } = await supabase
      .from("jury_participants")
      .select("user_id, first_name, last_name, email, date_of_birth, city, county, state, gender, race, marital_status, political_affiliation, education_level, currently_employed, family_income, served_on_jury, has_children")
      .in("user_id", acceptedIds);

    for (const p of juryData ?? []) {
      let age: number | null = null;
      if (p.date_of_birth) {
        const dob = new Date(p.date_of_birth);
        const now = new Date();
        age = now.getFullYear() - dob.getFullYear();
        const monthDiff = now.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
          age--;
        }
      }
      participants.push({
        first_name: p.first_name ?? "",
        last_name: p.last_name ?? "",
        email: p.email ?? "",
        city: p.city,
        county: p.county,
        state: p.state,
        gender: p.gender,
        race: p.race,
        age,
        marital_status: p.marital_status,
        political_affiliation: p.political_affiliation,
        education_level: p.education_level,
        currently_employed: p.currently_employed,
        family_income: p.family_income,
        served_on_jury: p.served_on_jury,
        has_children: p.has_children,
      });
    }

    // Check oldData for any participants not found in jury_participants
    const foundIds = new Set((juryData ?? []).map((p) => p.user_id));
    const missingIds = acceptedIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      const { data: oldData } = await supabase
        .from("oldData")
        .select("id, first_name, last_name, email, date_of_birth, city, county, state, gender, race, marital_status, political_affiliation, education_level, currently_employed, family_income, served_on_jury, has_children")
        .in("id", missingIds);

      for (const p of oldData ?? []) {
        let age: number | null = null;
        if (p.date_of_birth) {
          const dob = new Date(p.date_of_birth);
          const now = new Date();
          age = now.getFullYear() - dob.getFullYear();
          const monthDiff = now.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
            age--;
          }
        }
        participants.push({
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          email: p.email ?? "",
          city: p.city,
          county: p.county,
          state: p.state,
          gender: p.gender,
          race: p.race,
          age,
          marital_status: p.marital_status,
          political_affiliation: p.political_affiliation,
          education_level: p.education_level,
          currently_employed: p.currently_employed,
          family_income: p.family_income,
          served_on_jury: p.served_on_jury,
          has_children: p.has_children,
        });
      }
    }
  }

  // 6. Send email
  await sendPresenterInfoEmail(
    presenterEmail,
    sessionDateStr,
    session.zoom_link ?? null,
    driveLinks,
    participants,
  );

  // 7. Mark cases as submitted (preserve original "Notify Presenter" behavior)
  if (caseIds.length) {
    await supabase
      .from("cases")
      .update({ admin_status: "submitted" })
      .in("id", caseIds);
  }

  revalidatePath("/dashboard/Admin");
  revalidatePath("/dashboard/Admin/sessions");
}
