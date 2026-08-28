"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, sendRescheduleEmail, sendSessionCreatedEmail, sendSessionCompletedEmail, sendPresenceConfirmedEmail, sendPresenceDeclinedEmail, sendZoomLinkEmail, sendSessionLocationEmail, sendWaitlistLocationEmail, sendPresenterInfoEmail, sendWaitlistZoomLinkEmail, sendWaitlistCalledInEmail, sendWaitlistWaitedOutEmail, sendWaitlistConfirmationEmail, emailWrapper } from "@/lib/mail";
import type { PresenterParticipantInfo, PresenterCaseInfo } from "@/lib/mail";
import { checkAndNotifySessionFull, getSessionOccupancy } from "@/lib/participant/updateInviteStatus";
import { recordBackoutStrike } from "@/lib/actions/participantFlags";
import { generateEmailActionToken } from "@/lib/emailActionToken";
import {
  getLineageInvolvementForCases,
  splitLineageInvolvement,
  type LineageInvolvement,
} from "@/lib/case-lineage";
import { ACTIVE_STATUS, isActiveStatus, isParticipantActive } from "@/lib/participant/activeStatus";
import { cooldownAfterSession } from "@/lib/participant/sessionStart";
import {
  WAITLISTED_STATUS,
  isWaitlisted,
  assignSlot,
  sessionLengthHours,
  seatPayoutCents,
  hourlyRateCents,
  waitlistHoldMinutes,
  waitlistWaitFeeCents,
  OFFLINE_ARRIVE_EARLY_MINUTES,
  formatCents,
} from "@/lib/participant/waitlist";
import { assertCasesShareDeliveryMode, isOffline } from "@/lib/case/deliveryMode";
import { getSessionDeliveryModeOrDefault } from "@/lib/case/getSessionDeliveryMode";
import { NO_LOGIN_REASON, getAllIdsWithoutLogin, getIdsWithoutLogin } from "@/lib/participant/loginAccount";
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

/**
 * Every case in a session must be run the same way — all in a room, or all over
 * Zoom. A session has one venue, one set of joining instructions and one
 * participant pay rate, so a mixed session cannot be described to anyone
 * correctly. Checked before the write so the admin gets a sentence rather than
 * a raw trigger error, and re-checked by the database for writes that never come
 * through here.
 *
 * The cases already attached are compared in full, including one that is about
 * to be swapped out. That is deliberate: a replacement has to match the session
 * it is joining, and excluding the outgoing case would let the LAST case in a
 * session be swapped for the other format — silently re-pricing a session whose
 * participants have already accepted at one rate and been sent one venue.
 * Changing a session's format means taking the case out and building a new
 * session, not replacing it in place.
 *
 * Returns the mode the session now has, or null when nothing is attached.
 */
async function assertSessionDeliveryModeFits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  incomingCaseIds: string[],
) {
  const { data: incomingRows } = incomingCaseIds.length
    ? await supabase.from("cases").select("id, delivery_mode").in("id", incomingCaseIds)
    : { data: [] };

  const { data: attachedRows } = await supabase
    .from("session_cases")
    .select("case_id, cases(delivery_mode)")
    .eq("session_id", sessionId);

  type AttachedRow = {
    case_id: string;
    cases?: { delivery_mode?: string | null } | { delivery_mode?: string | null }[] | null;
  };

  const existing = ((attachedRows ?? []) as AttachedRow[])
    // A case being re-attached to the session it is already in cannot conflict
    // with itself; everything else already there constrains the incoming set.
    .filter((r) => !incomingCaseIds.includes(r.case_id))
    .map((r) => {
      const c = Array.isArray(r.cases) ? r.cases[0] : r.cases;
      return c?.delivery_mode ?? null;
    });

  return assertCasesShareDeliveryMode(
    (incomingRows ?? []).map((c) => c.delivery_mode as string | null),
    existing,
  );
}

export async function addCasesToSession(
  sessionId: string,
  cases: { caseId: string; start: string; end: string }[],
  sessionDate?: string,
  timezone?: string
) {
  const supabase = await createClient();

  await assertSessionDeliveryModeFits(
    supabase,
    sessionId,
    cases.map((c) => c.caseId),
  );

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
      const requesteeScheduledAt = scheduledAtMap[c.caseId] ?? null;

      // If admin time differs from requestee's preferred time, reset status so
      // requestee must re-confirm via the notification popup
      const timesMatch =
        requesteeScheduledAt !== null &&
        new Date(requesteeScheduledAt).getTime() === new Date(adminScheduledAt).getTime();

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
/**
 * Outcome of an invite attempt. Returned rather than thrown so the caller can
 * tell the admin what actually happened. Previously this function threw on
 * failure — which in production surfaces as a bare 500 with an opaque digest —
 * and returned `undefined` when every invitee was filtered out, so a session
 * could be created with zero invites while the UI reported success.
 */
export type InviteResult = {
  ok: boolean;
  invited: number;
  /** Dropped by the hard guards, by reason. */
  skipped: { blacklisted: number; inactive: number; noAccount: number };
  /**
   * Participants who could not be invited, by name. Mostly the no-login case:
   * session_participants.participant_id FKs onto auth.users(id), so someone with
   * a jury_participants row but no auth.users row can never be invited (FK
   * 23503). Caught up front now; the FK path below is the backstop.
   */
  rejected?: { name: string; reason: string }[];
  /** Set when ok is false. Safe to show to an admin. */
  error?: string;
};

export async function inviteParticipants(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
): Promise<InviteResult> {
  try {
    return await inviteParticipantsInner(sessionId, participantIds, sessionDate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[inviteParticipants] FAILED for session ${sessionId} with ${participantIds.length} id(s): ${message}`,
      err
    );
    return {
      ok: false,
      invited: 0,
      skipped: { blacklisted: 0, inactive: 0, noAccount: 0 },
      error: message,
    };
  }
}

async function inviteParticipantsInner(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
): Promise<InviteResult> {
  const supabase = await createClient();

  // ── Hard guard: blacklisted and non-active participants must NEVER be
  //    invited/added, no matter which caller reaches here (admin new-session,
  //    invite-more, requestee-add, or a tampered/stale client). Checked with the
  //    service role so RLS can't make the guard silently pass. For blacklist,
  //    both markers (roles + jury_participants) are checked in case they ever
  //    drift out of sync.
  const uniqueIds = Array.from(new Set(participantIds));
  const [{ data: blByRole }, { data: jpRows }] = await Promise.all([
    supabaseAdmin.from("roles").select("user_id").eq("role", "blacklisted").in("user_id", uniqueIds),
    supabaseAdmin
      .from("jury_participants")
      // email + name come along so we can address the invite and name a failure
      // without depending on the auth admin API, which is not always readable
      // (at least one auth row currently returns "Database error loading user").
      .select("user_id, blacklisted_at, reactivation_status, email, first_name, last_name")
      .in("user_id", uniqueIds),
  ]);

  type JpRow = {
    user_id: string;
    blacklisted_at: string | null;
    reactivation_status: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  const jpById = new Map<string, JpRow>(
    ((jpRows ?? []) as JpRow[]).map((r) => [r.user_id, r])
  );
  const nameOf = (id: string) => {
    const r = jpById.get(id);
    const name = `${r?.first_name ?? ""} ${r?.last_name ?? ""}`.trim();
    return name || r?.email || id;
  };
  const blacklistedSet = new Set<string>([
    ...((blByRole ?? []).map((r: { user_id: string }) => r.user_id)),
    ...((jpRows ?? [])
      .filter((r: { blacklisted_at: string | null }) => r.blacklisted_at != null)
      .map((r: { user_id: string }) => r.user_id)),
  ]);

  // Only an explicit reactivation_status of "yes" may attend. Judged off the rows
  // we could actually read, for the reason documented in lib/participant/activeStatus.
  const inactiveSet = new Set<string>(
    (jpRows ?? [])
      .filter((r: { reactivation_status: string | null }) => !isActiveStatus(r.reactivation_status))
      .map((r: { user_id: string }) => r.user_id)
  );

  const allowedIds = uniqueIds.filter(
    (id) => !blacklistedSet.has(id) && !inactiveSet.has(id)
  );

  if (blacklistedSet.size > 0) {
    console.warn(
      `[inviteParticipants] Blocked ${blacklistedSet.size} blacklisted participant(s) from session ${sessionId}:`,
      Array.from(blacklistedSet)
    );
  }
  if (inactiveSet.size > 0) {
    console.warn(
      `[inviteParticipants] Blocked ${inactiveSet.size} non-active participant(s) from session ${sessionId} ` +
      `(reactivation_status must be "${ACTIVE_STATUS}"):`,
      Array.from(inactiveSet)
    );
  }
  // ── Hard guard: a participant with no auth.users row can never be invited.
  //    participant_id has an FK onto auth.users(id) and the whole participant
  //    flow is login-based (magic-link accept, DL/PayPal profile), so this is not
  //    a database quirk to work around — those profiles are not people who can
  //    attend. Checked up front so they are named rather than surfacing as a raw
  //    FK 23503; the row-by-row retry below stays as the backstop for when this
  //    check cannot answer. See lib/participant/loginAccount.
  const rejected: { name: string; reason: string }[] = [];
  const noLoginSet = await getIdsWithoutLogin(allowedIds);
  const invitableIds = allowedIds.filter((id) => !noLoginSet.has(id));

  if (noLoginSet.size > 0) {
    console.warn(
      `[inviteParticipants] Blocked ${noLoginSet.size} participant(s) with no login account ` +
      `from session ${sessionId} (no auth.users row — they can never be invited):`,
      Array.from(noLoginSet)
    );
    for (const id of allowedIds) {
      if (noLoginSet.has(id)) rejected.push({ name: nameOf(id), reason: NO_LOGIN_REASON });
    }
  }

  const skipped = {
    blacklisted: blacklistedSet.size,
    inactive: inactiveSet.size,
    noAccount: noLoginSet.size,
  };

  if (invitableIds.length === 0) {
    revalidatePath("/dashboard/Admin/sessions");
    // Not an error, but absolutely not a success either — say so, or the admin
    // is told the invites went out when nobody was invited.
    const reasons = [
      skipped.inactive > 0 ? `${skipped.inactive} not active` : null,
      skipped.blacklisted > 0 ? `${skipped.blacklisted} blacklisted` : null,
      skipped.noAccount > 0 ? `${skipped.noAccount} with no login account` : null,
    ].filter(Boolean).join(", ");
    const named = rejected.length
      ? ` ${rejected.map((r) => `${r.name}: ${r.reason}`).join("; ")}`
      : "";
    return {
      ok: false,
      invited: 0,
      skipped,
      rejected,
      error: reasons
        ? `Nobody was invited — every selected participant was skipped (${reasons}).${named}`
        : "Nobody was invited — no valid participants were selected.",
    };
  }

  const rows = invitableIds.map((id) => ({
    session_id: sessionId,
    participant_id: id,
    invite_status: "pending",
  }));

  // Insert as one batch first. If the batch is rejected, retry row by row so a
  // single bad participant cannot block everyone else in the selection.
  //
  // This matters because of a real data problem: participant_id has an FK onto
  // auth.users(id), and some jury_participants rows have no auth user. Selecting
  // one of those made the whole batch fail with FK 23503, so an admin inviting
  // ten people got zero invites and an opaque 500. The guard above now catches
  // that case by name; this stays for anything it could not rule out.
  let insertedRows: { id: string; participant_id: string }[] = [];

  const batch = await supabase.from("session_participants").insert(rows).select();

  if (!batch.error) {
    insertedRows = (batch.data ?? []) as { id: string; participant_id: string }[];
  } else {
    console.warn(
      `[inviteParticipants] Batch insert of ${rows.length} row(s) failed ` +
      `(${batch.error.code ?? "?"}: ${batch.error.message}) — retrying individually.`
    );

    for (const row of rows) {
      const one = await supabase
        .from("session_participants")
        .insert(row)
        .select();

      if (one.error) {
        const reason =
          one.error.code === "23503"
            ? NO_LOGIN_REASON
            : `${one.error.message}${one.error.code ? ` [${one.error.code}]` : ""}`;
        rejected.push({ name: nameOf(row.participant_id), reason });
        console.error(
          `[inviteParticipants] Rejected ${row.participant_id} (${nameOf(row.participant_id)}): ` +
          `${one.error.code ?? "?"} ${one.error.message}`
        );
      } else {
        insertedRows.push(...((one.data ?? []) as { id: string; participant_id: string }[]));
      }
    }

    // Everything failed — report it rather than pressing on to the email loop.
    if (insertedRows.length === 0) {
      revalidatePath("/dashboard/Admin/sessions");
      const detail = rejected.length
        ? rejected.map((r) => `${r.name}: ${r.reason}`).join("; ")
        : `${batch.error.message}${batch.error.code ? ` [${batch.error.code}]` : ""}`;
      return {
        ok: false,
        invited: 0,
        skipped,
        rejected,
        error: `No invites could be created. ${detail}`,
      };
    }
  }

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

  // An in-person invitation is a different ask: it costs the invitee a journey,
  // it pays a different rate, and its waitlist has its own hold window and fee.
  // All of that has to be in the email, or people accept the wrong thing.
  const deliveryMode = await getSessionDeliveryModeOrDefault(sessionId);
  const offline = isOffline(deliveryMode);
  const hourlyRate = formatCents(hourlyRateCents(deliveryMode));
  const inviteWaitFee = formatCents(waitlistWaitFeeCents(deliveryMode));
  const inviteHoldMinutes = waitlistHoldMinutes(deliveryMode);

  // Send invitation emails to each participant
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  // Invite rows that were created but whose email could not be sent. Reported
  // back so "invited 10" never silently means "emailed 7".
  const emailFailures: { name: string; reason: string }[] = [];

  for (const row of (insertedRows || [])) {
    const participantId = row.participant_id;
    const inviteRecordId = row.id;

    try {
      // Resolve the address from jury_participants first and treat the auth admin
      // API only as a fallback. It used to be the other way round, which meant an
      // unreadable auth row silently skipped that person's invite email entirely —
      // the row was created, no mail was sent, and the only trace was a log line.
      // At least one auth row currently returns "Database error loading user".
      let participantEmail = jpById.get(participantId)?.email ?? null;

      if (!participantEmail) {
        const { data: userData, error: userError } =
          await supabaseAdmin.auth.admin.getUserById(participantId);
        participantEmail = userData?.user?.email ?? null;

        if (!participantEmail) {
          console.error(
            `[inviteParticipants] No email for participant ${participantId} ` +
            `(${nameOf(participantId)}) — invite row exists but no mail can be sent: ` +
            `${userError?.message ?? "not in jury_participants and no auth email"}`
          );
          emailFailures.push({
            name: nameOf(participantId),
            reason: "no email address on file",
          });
          continue;
        }
      }
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
            "location": ${offline
              ? `{ "@type": "Place", "name": "In-Person (address to follow)", "address": "To be confirmed" }`
              : `{ "@type": "Place", "name": "Remote (Secure Zoom)", "address": "Online" }`},
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
              <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Session Time</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${timeStr}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 20px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Format</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">
                  ${offline ? "In-Person &mdash; you attend at a venue" : "Online &mdash; you join over Zoom"}
                </p>
              </td>
            </tr>
          </table>

          ${offline ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 24px;">
            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0 0 8px;font-size:14px;color:#166534;">
                  <strong>This session is held in person.</strong> You will need to travel to the venue, so please only accept if you can be there for the full session.
                </p>
                <p style="margin:0 0 8px;font-size:13px;color:#166534;">
                  We will email you the full address once you accept. Bring your <strong>Texas State ID</strong> and plan to arrive <strong>${OFFLINE_ARRIVE_EARLY_MINUTES} minutes early</strong> for check-in.
                </p>
                <p style="margin:0;font-size:13px;color:#166534;">
                  <strong>Please note:</strong> an in-person session can be cancelled at any time before its scheduled start time. If it is cancelled, the session does not go ahead and <strong>you will not be paid</strong> for it. We will let you know as soon as we can, so please check your email before you set out.
                </p>
              </td>
            </tr>
          </table>` : ''}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px;margin:0 0 24px;">
            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0 0 10px;font-size:14px;color:#475569;">
                  <strong>What this pays:</strong> ${hourlyRate} per hour for the full scheduled session length.
                </p>
                <p style="margin:0;font-size:14px;color:#475569;">
                  <strong>About your payment:</strong> payment for this session is sent to the PayPal username on your profile. PayPal treats it as a &ldquo;service&rdquo; payment and takes a processing fee out of it, so the amount that reaches you is about <strong>$2 to $3 less</strong> than the session amount. That fee is PayPal&rsquo;s, not ours.
                </p>
                <p style="margin:10px 0 0;font-size:13px;color:#64748b;">
                  <strong>Please note:</strong> seats are filled in the order people reply. If this session fills up before you respond, we may be able to offer you a paid <strong>waitlist spot</strong> instead of a seat &mdash; ${offline
                    ? `you would come to the venue, hold for up to ${inviteHoldMinutes} minutes, and be paid ${inviteWaitFee} for waiting even if no seat opens`
                    : `you would hold in the Zoom waiting room for up to ${inviteHoldMinutes} minutes and be paid ${inviteWaitFee} for waiting even if no seat opens`}. You will be shown exactly what that involves and can accept or decline it separately.
                </p>
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
      emailFailures.push({
        name: nameOf(participantId),
        reason: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  }

  revalidatePath("/dashboard/Admin/sessions");

  const invited = insertedRows.length;
  const problems = [...rejected, ...emailFailures];

  // Partial success is still a failure worth showing: an admin who selected ten
  // people and got seven invites needs to know which three, and why.
  if (problems.length > 0) {
    return {
      ok: false,
      invited,
      skipped,
      rejected: problems,
      error:
        `Invited ${invited} of ${invited + rejected.length}. ` +
        `Not sent: ${problems.map((p) => `${p.name} (${p.reason})`).join("; ")}`,
    };
  }

  return { ok: true, invited, skipped };
}

/* =========================
   NOTIFY REQUESTEES SESSION CREATED
========================= */
export async function notifyRequesteesSessionCreated(
  sessionId: string,
  caseIds: string[],
  sessionDate: string,
  participantCount: number
) {
  if (!caseIds.length) return;

  const supabase = await createClient();

  // Fetch case titles and requestee user_ids
  const { data: caseRows } = await supabase
    .from("cases")
    .select("id, title, user_id, delivery_mode")
    .in("id", caseIds);

  if (!caseRows?.length) return;

  // Every case in a session shares a mode, so reading it off the first is
  // enough — and the requestee is told which one, since an in-person session
  // means travelling rather than clicking a link.
  const offline = caseRows.some((c) => isOffline(c.delivery_mode));

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

  // Group case titles by requestee (one email per requestee)
  const requesteeMap = new Map<string, string[]>();
  for (const c of caseRows) {
    if (!c.user_id) continue;
    if (!requesteeMap.has(c.user_id)) requesteeMap.set(c.user_id, []);
    requesteeMap.get(c.user_id)!.push(c.title);
  }

  for (const [requesteeId, titles] of requesteeMap) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requesteeId);
      const email = userData?.user?.email;
      if (email) {
        await sendSessionCreatedEmail(email, titles, dateStr, timeStr, participantCount, offline);
        console.log(`[notifyRequestees] Session created email sent to ${email}`);
      }
    } catch (e) {
      console.error(`[notifyRequestees] Failed to email requestee ${requesteeId}:`, e);
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

  // Reset schedule_status so requestee must re-confirm the new date
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

  // 3. Notify everyone holding a place — seated participants and waitlisters
  //    alike, since a waitlister has committed to the same date and time.
  const { data: acceptedRows } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId)
    .in("invite_status", ["accepted", WAITLISTED_STATUS]);

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

  // 4. Notify requestee(s) — deduplicated by user_id
  const caseIds = caseUpdates.map((cu) => cu.caseId);
  if (caseIds.length) {
    const { data: caseRows } = await supabase
      .from("cases")
      .select("user_id")
      .in("id", caseIds);

    const uniqueRequesteeIds = Array.from(
      new Set((caseRows ?? []).map((c) => c.user_id).filter(Boolean))
    );

    for (const requesteeId of uniqueRequesteeIds) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requesteeId);
        if (userData?.user?.email) {
          await sendRescheduleEmail(userData.user.email, newDateStr, "requestee");
        }
      } catch (e) {
        console.error(`Reschedule email failed for requestee ${requesteeId}:`, e);
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

  // Accepting on someone's behalf still puts them in the session, so it obeys the
  // same active-panel rule as a self-accept. Rejecting is always allowed.
  // Reachable for invites that predate the rule — new ones can't be created for a
  // non-active participant at all (see inviteParticipants).
  if (action === "accepted" && !(await isParticipantActive(participantId))) {
    throw new Error(
      "This participant is not active (they have not confirmed they are still " +
      `interested), so they cannot attend. Set their Active status to "${ACTIVE_STATUS}" first.`
    );
  }

  // Accepting on someone's behalf takes a slot exactly as a self-accept does, so
  // it goes through the same seat → waitlist → full assignment. Writing
  // 'accepted' straight through would silently overfill the cap and never create
  // a waitlist row.
  let onBehalfSlot: "seat" | "waitlist" = "seat";
  let onBehalfPosition: number | null = null;
  let onBehalfHours = 0;
  let deliveryMode = await getSessionDeliveryModeOrDefault(sessionId);

  if (action === "accepted") {
    const { data: caseTimeRows } = await supabase
      .from("session_cases")
      .select("start_time, end_time")
      .eq("session_id", sessionId);

    type CaseTimes = { start_time: string | null; end_time: string | null };
    const times = (caseTimeRows ?? []) as CaseTimes[];
    onBehalfHours = sessionLengthHours(
      times.map((r) => r.start_time),
      times.map((r) => r.end_time),
    );

    const occupancy = await getSessionOccupancy(sessionId);
    deliveryMode = occupancy.deliveryMode;
    const assigned = assignSlot(occupancy);
    if (assigned === "full") {
      throw new Error(
        `This session is full — ${occupancy.acceptedCount}/${occupancy.participantCap} seats taken ` +
        `and all ${occupancy.waitlistCap} waitlist slots used. Raise the participant cap or the ` +
        `waitlist cap before adding anyone else.`
      );
    }
    onBehalfSlot = assigned;
    if (assigned === "waitlist") onBehalfPosition = occupancy.waitlistCount + 1;
  }

  const onBehalfWaitlisted = action === "accepted" && onBehalfSlot === "waitlist";

  const { error } = await supabase
    .from("session_participants")
    .update({
      invite_status: onBehalfWaitlisted ? WAITLISTED_STATUS : action,
      responded_at: new Date().toISOString(),
      ...(action === "accepted"
        ? {
            waitlist_position: onBehalfPosition,
            payout_cents: onBehalfWaitlisted
              ? waitlistWaitFeeCents(deliveryMode)
              : seatPayoutCents(onBehalfHours, deliveryMode),
          }
        : // Declining ends any claim on the session — drop the amount and the
          // slot, or a former waitlister keeps showing as owed after saying no.
          { payout_cents: null, waitlist_position: null }),
    })
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
    .select("session_date, zoom_link, location")
    .eq("id", sessionId)
    .single();

  const offline = isOffline(deliveryMode);

  // The status change is already committed. A mail failure must not surface as
  // "the action failed" — that reads as though nothing happened, when in fact the
  // participant has been seated or waitlisted.
  try {
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

      // Someone put on the waitlist must never receive a plain "you're confirmed"
      // email — the hold rules and the two payment outcomes are the whole point.
      if (onBehalfWaitlisted) {
        await sendWaitlistConfirmationEmail(
          email,
          firstName,
          session.session_date,
          waitlistHoldMinutes(deliveryMode),
          formatCents(hourlyRateCents(deliveryMode)),
          formatCents(waitlistWaitFeeCents(deliveryMode)),
          timeStr,
          offline,
        );
      } else {
        await sendPresenceConfirmedEmail(email, firstName, session.session_date, timeStr, offline);
      }

      // Whichever joining detail the session already carries goes out now. An
      // in-person session has an address and no Zoom link; an online one the
      // reverse.
      const joinDetail = offline ? session.location : session.zoom_link;
      if (joinDetail) {
        const detailTimeStr = await sessionTimeString(supabase, sessionId);

        if (offline && onBehalfWaitlisted) {
          await sendWaitlistLocationEmail(
            email,
            firstName,
            session.session_date,
            joinDetail,
            waitlistHoldMinutes(deliveryMode),
            formatCents(hourlyRateCents(deliveryMode)),
            formatCents(waitlistWaitFeeCents(deliveryMode)),
            detailTimeStr,
          );
        } else if (offline) {
          await sendSessionLocationEmail(
            email,
            firstName,
            session.session_date,
            joinDetail,
            detailTimeStr,
            formatCents(hourlyRateCents(deliveryMode)),
          );
        } else if (onBehalfWaitlisted) {
          await sendWaitlistZoomLinkEmail(
            email,
            firstName,
            session.session_date,
            joinDetail,
            waitlistHoldMinutes(deliveryMode),
            formatCents(hourlyRateCents(deliveryMode)),
            formatCents(waitlistWaitFeeCents(deliveryMode)),
            detailTimeStr,
          );
        } else {
          await sendZoomLinkEmail(email, firstName, session.session_date, joinDetail, detailTimeStr);
        }
        console.log(
          `[adminRespondOnBehalf] Sent ${offline ? "location" : "zoom link"} email to ${email} (already saved)`,
        );
      }
    } else {
      await sendPresenceDeclinedEmail(email, firstName, session.session_date);
    }
  }
  } catch (emailErr) {
    console.error("[adminRespondOnBehalf] Email failed (status change stands):", emailErr);
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
   WAITLIST OUTCOMES

   A waitlister holds a reserve slot: online they join Zoom and sit in the
   waiting room for 15 minutes; in person they arrive 15 minutes early and hold
   on site for 30 minutes. Either way the call-in happens in the room or the
   meeting, not in the app — an admin records which of the two outcomes
   happened, and the payout follows from that choice at this session's own
   terms (see waitlistHoldMinutes / waitlistWaitFeeCents).

     called in  -> flips to a real seat, paid the hourly rate for the FULL
                   session length, and picks up the usual post-session cooldown
     waited out -> stays 'waitlisted', paid the flat waiting fee, and keeps
                   their eligibility for other sessions

   Nothing here runs automatically. There is no scheduler in this app, and
   guessing the outcome from the clock would invent payouts.
========================= */

/** Session date, case times and the participant's contact details in one hop. */
async function loadWaitlistContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  participantId: string,
) {
  const [{ data: session }, { data: caseRows }, { data: inviteRow }, deliveryMode] = await Promise.all([
    supabase.from("sessions").select("session_date").eq("id", sessionId).single(),
    supabase.from("session_cases").select("start_time, end_time").eq("session_id", sessionId),
    supabase
      .from("session_participants")
      .select("invite_status, waitlist_outcome")
      .eq("session_id", sessionId)
      .eq("participant_id", participantId)
      .maybeSingle(),
    getSessionDeliveryModeOrDefault(sessionId),
  ]);

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

  type CaseTimes = { start_time: string | null; end_time: string | null };
  const times = (caseRows ?? []) as CaseTimes[];

  const sessionDate = (session?.session_date as string | undefined) ?? null;

  return {
    inviteRow: inviteRow as { invite_status: string | null; waitlist_outcome: string | null } | null,
    sessionDate,
    deliveryMode,
    hours: sessionLengthHours(
      times.map((r) => r.start_time),
      times.map((r) => r.end_time),
    ),
    /** Day after the session ends, for the post-seat cooldown. Null if unreadable. */
    cooldownAfterAt: cooldownAfterSession(
      sessionDate,
      times.map((r) => r.start_time),
      times.map((r) => r.end_time),
    ),
    email,
    firstName,
  };
}

function longDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Call a waitlisted participant into the meeting. Flips them to a real seat —
 * this deliberately bypasses `participant_cap`, because the seat they are
 * filling belongs to someone who did not show up and is not handed back
 * automatically. The accepted count can therefore read above the cap.
 */
export async function callInWaitlistParticipant(sessionId: string, participantId: string) {
  const supabase = await createClient();
  const ctx = await loadWaitlistContext(supabase, sessionId, participantId);

  if (!ctx.inviteRow || !isWaitlisted(ctx.inviteRow.invite_status)) {
    throw new Error("This participant is not on the waitlist for this session.");
  }

  const payoutCents = seatPayoutCents(ctx.hours, ctx.deliveryMode);

  const { error } = await supabase
    .from("session_participants")
    .update({
      invite_status: "accepted",
      waitlist_outcome: "called_in",
      waitlist_outcome_at: new Date().toISOString(),
      payout_cents: payoutCents,
    })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);

  if (error) throw error;

  // They have now taken a seat, so the post-session cooldown applies — the same
  // one a self-accept sets. Waitlisting alone never sets it.
  if (ctx.cooldownAfterAt) {
    const { error: cooldownErr } = await supabaseAdmin
      .from("jury_participants")
      .update({ eligible_after_at: ctx.cooldownAfterAt })
      .eq("user_id", participantId);
    if (cooldownErr) console.error("[callInWaitlist] Cooldown update failed:", cooldownErr.message);
  }

  if (ctx.email && ctx.sessionDate) {
    try {
      await sendWaitlistCalledInEmail(
        ctx.email,
        ctx.firstName,
        longDate(ctx.sessionDate),
        formatCents(payoutCents),
        formatCents(hourlyRateCents(ctx.deliveryMode)),
      );
    } catch (err) {
      console.error("[callInWaitlist] Email failed:", err);
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
  revalidatePath("/dashboard/Admin", "layout");
}

/**
 * Record that a waitlister held the full window and was never called in. They
 * stay 'waitlisted' — they did not sit on the case — and are paid the flat fee.
 */
export async function markWaitlistWaitedOut(sessionId: string, participantId: string) {
  const supabase = await createClient();
  const ctx = await loadWaitlistContext(supabase, sessionId, participantId);

  if (!ctx.inviteRow || !isWaitlisted(ctx.inviteRow.invite_status)) {
    throw new Error("This participant is not on the waitlist for this session.");
  }

  const { error } = await supabase
    .from("session_participants")
    .update({
      waitlist_outcome: "waited_out",
      waitlist_outcome_at: new Date().toISOString(),
      payout_cents: waitlistWaitFeeCents(ctx.deliveryMode),
    })
    .eq("session_id", sessionId)
    .eq("participant_id", participantId);

  if (error) throw error;

  if (ctx.email && ctx.sessionDate) {
    try {
      await sendWaitlistWaitedOutEmail(
        ctx.email,
        ctx.firstName,
        longDate(ctx.sessionDate),
        formatCents(waitlistWaitFeeCents(ctx.deliveryMode)),
        waitlistHoldMinutes(ctx.deliveryMode),
        isOffline(ctx.deliveryMode),
      );
    } catch (err) {
      console.error("[markWaitlistWaitedOut] Email failed:", err);
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   FLAG PARTICIPANT (no-show / back-out strike)
   Standalone manual admin action — completely independent of Accept/Decline on
   behalf and their email logic. Records one strike against THIS session;
   recordBackoutStrike stamps the session's invite row, bumps the running
   counter, and auto-blacklists the participant once they reach the flag limit.
========================= */
export async function flagParticipant(participantId: string, sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await recordBackoutStrike(participantId, sessionId, user?.id);

  revalidatePath("/dashboard/Admin/sessions");
  revalidatePath("/dashboard/Admin/participants");
  // The case page shows "Striked" on its session roster, so it has to re-render too.
  revalidatePath("/dashboard/Admin", "layout");
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

  // Group case titles by requestee
  const requesteeMap = new Map<string, string[]>();
  for (const c of (caseRows ?? [])) {
    if (!c.user_id) continue;
    if (!requesteeMap.has(c.user_id)) requesteeMap.set(c.user_id, []);
    requesteeMap.get(c.user_id)!.push(c.title);
  }

  // Send email immediately to each requestee
  for (const [requesteeId, titles] of requesteeMap) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requesteeId);
      const email = userData?.user?.email;
      if (email) {
        await sendSessionCompletedEmail(email, titles, sessionDateStr);
        console.log(`[sendCompletionNow] Sent to ${email} for session ${sessionId}`);
      }
    } catch (e) {
      console.error(`[sendCompletionNow] Failed for requestee ${requesteeId}:`, e);
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
/** "9:00 AM – 11:00 AM CT" spanning every case in the session, or undefined. */
async function sessionTimeString(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<string | undefined> {
  const { data: rows } = await supabase
    .from("session_cases")
    .select("start_time, end_time")
    .eq("session_id", sessionId);

  if (!rows?.length) return undefined;

  const formatCentralTime = (t: string) => {
    const [h, m] = t.split(":");
    const d = new Date();
    d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  };

  const starts = rows.map((r) => r.start_time).filter(Boolean).sort();
  const ends = rows.map((r) => r.end_time).filter(Boolean).sort();
  if (!starts.length || !ends.length) return undefined;

  return `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`;
}

export async function sendZoomLink(formData: FormData) {
  const supabase = await createClient();
  const sessionId = formData.get("sessionId") as string;
  const zoomLink = (formData.get("zoomLink") as string)?.trim();

  if (!zoomLink) throw new Error("Zoom link is required");

  // An in-person session has no Zoom meeting to join. Sending one would tell
  // people to stay home for a session they are expected to travel to.
  const zoomMode = await getSessionDeliveryModeOrDefault(sessionId);
  if (isOffline(zoomMode)) {
    throw new Error(
      "This is an in-person session — send the venue location instead of a Zoom link.",
    );
  }

  // Fetch session date
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");
  const sessionDate = session.session_date as string;

  const timeStr = await sessionTimeString(supabase, sessionId);

  // Waitlisters need the link too — holding in the Zoom waiting room is the
  // whole point of the slot — but they get the waitlist template, which spells
  // out the hold window and the two payment outcomes.
  const { data: participants } = await supabase
    .from("session_participants")
    .select("participant_id, invite_status")
    .eq("session_id", sessionId)
    .in("invite_status", ["accepted", WAITLISTED_STATUS]);

  if (!participants?.length) return;

  for (const p of participants) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(p.participant_id);
      const email = userData?.user?.email;
      const firstName =
        userData?.user?.user_metadata?.first_name ||
        userData?.user?.user_metadata?.full_name?.split(" ")[0] ||
        "Participant";

      if (!email) continue;

      if (isWaitlisted(p.invite_status)) {
        await sendWaitlistZoomLinkEmail(
          email,
          firstName,
          sessionDate,
          zoomLink,
          waitlistHoldMinutes(zoomMode),
          formatCents(hourlyRateCents(zoomMode)),
          formatCents(waitlistWaitFeeCents(zoomMode)),
          timeStr,
        );
      } else {
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
   SEND SESSION LOCATION (in-person)

   The offline counterpart to sendZoomLink: the same shape, an address instead of
   a URL. Waitlisters are included and get their own template, exactly as the
   Zoom path does — an in-person reserve slot is held at the venue, so the
   address matters to them as much as to a seated participant.
========================= */
export async function sendSessionLocation(formData: FormData) {
  const supabase = await createClient();
  const sessionId = formData.get("sessionId") as string;
  const location = (formData.get("location") as string)?.trim();

  if (!location) throw new Error("A location is required");

  const mode = await getSessionDeliveryModeOrDefault(sessionId);
  if (!isOffline(mode)) {
    throw new Error(
      "This is an online session — send the Zoom link instead of a location.",
    );
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");
  const sessionDate = session.session_date as string;

  const timeStr = await sessionTimeString(supabase, sessionId);

  // Persisted first, unlike the Zoom path. The address is what someone shows up
  // to; if the mail loop dies halfway the admin must still be able to see what
  // was sent and re-send, rather than have the field read empty.
  const { error: saveError } = await supabase
    .from("sessions")
    .update({ location })
    .eq("id", sessionId);
  if (saveError) throw saveError;

  // Waitlisters need the address too — travelling to the venue and holding on
  // site is the whole point of an in-person reserve slot — but they get the
  // waitlist template, which spells out the hold window and the two payment
  // outcomes. Mirrors how sendZoomLink treats its own waitlisters.
  const { data: participants } = await supabase
    .from("session_participants")
    .select("participant_id, invite_status")
    .eq("session_id", sessionId)
    .in("invite_status", ["accepted", WAITLISTED_STATUS]);

  const rate = formatCents(hourlyRateCents(mode));
  const holdMinutes = waitlistHoldMinutes(mode);
  const waitFee = formatCents(waitlistWaitFeeCents(mode));

  for (const p of participants ?? []) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(p.participant_id);
      const email = userData?.user?.email;
      const firstName =
        userData?.user?.user_metadata?.first_name ||
        userData?.user?.user_metadata?.full_name?.split(" ")[0] ||
        "Participant";

      if (!email) continue;

      if (isWaitlisted(p.invite_status)) {
        await sendWaitlistLocationEmail(
          email, firstName, sessionDate, location, holdMinutes, rate, waitFee, timeStr,
        );
      } else {
        await sendSessionLocationEmail(email, firstName, sessionDate, location, timeStr, rate);
      }
    } catch (e) {
      console.error(`[sendSessionLocation] Failed for participant ${p.participant_id}:`, e);
    }
  }

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

  // The replacement has to be the same format as the session it is joining —
  // including when it is replacing the only case there, which is exactly the
  // swap that would otherwise re-price a session out from under participants who
  // already accepted. Checked BEFORE the delete below, so a rejected swap leaves
  // the session exactly as it was rather than half-emptied.
  await assertSessionDeliveryModeFits(supabase, sessionId, [newCaseId]);

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

  // 5. Notify new requestee — same as rescheduleSession
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
        await sendRescheduleEmail(userData.user.email, newDateStr, "requestee");
      }
    } catch (e) {
      console.error(`Notification email failed for new requestee ${caseRow.user_id}:`, e);
    }
  }

  revalidatePath("/dashboard/Admin/sessions");
}

/* =========================
   SESSION LINEAGE INVOLVEMENT (cached)
   A lineage walk is several sequential round-trips (ancestors are chased one
   level at a time), and the Invite More search fires one per debounced
   keystroke. Cache the per-session result briefly so a burst of typing costs one
   walk instead of one per query.

   Instance-local and short-lived on purpose: a stale entry only affects which
   rows are greyed out as "Already used". It can never let someone be invited who
   shouldn't be — the recommended list recomputes the same set on every page
   render, and blacklist is enforced server-side in inviteParticipants.
========================= */
const BLOCKED_IDS_TTL_MS = 30_000;
const lineageInvolvementCache = new Map<
  string,
  { involvement: Map<string, LineageInvolvement>; at: number }
>();

async function getSessionLineageInvolvement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<Map<string, LineageInvolvement>> {
  const now = Date.now();
  const hit = lineageInvolvementCache.get(sessionId);
  if (hit && now - hit.at < BLOCKED_IDS_TTL_MS) return hit.involvement;

  // Drop expired entries so a long-lived instance doesn't accumulate sessions.
  for (const [key, entry] of lineageInvolvementCache) {
    if (now - entry.at >= BLOCKED_IDS_TTL_MS) lineageInvolvementCache.delete(key);
  }

  const { data: sessionCaseRows } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const caseIds = (sessionCaseRows ?? [])
    .map((r: { case_id: string | null }) => r.case_id)
    .filter((id): id is string => Boolean(id));

  const involvement = await getLineageInvolvementForCases(caseIds, supabase);
  lineageInvolvementCache.set(sessionId, { involvement, at: now });
  return involvement;
}

/* =========================
   SEARCH ELIGIBLE PARTICIPANTS
   Excludes: ineligible (eligible_after_at), already invited to this session.
   Blacklisted and lineage-blocked participants are NOT hidden — they come back
   flagged (`blacklisted` / `lineageBlocked`) so the UI can grey them out and say
   why. Neither can actually be invited: blacklist is enforced server-side by
   inviteParticipants, and lineage-blocked rows carry no selectable checkbox.

   Someone invited to this lineage before who never sat on it (declined, no
   response, or struck) is fully invitable; they come back selectable with
   `priorInvolvement` set so the UI can still show that history.
========================= */
export async function searchEligibleParticipants(
  sessionId: string,
  query: string,
) {
  const supabase = await createClient();

  // 0. Admin-only. This is a server action, so it is reachable by any signed-in
  //    user who knows a session id — and its lineage result is cached per
  //    session, so every caller must have the same read scope or a narrower
  //    (RLS-filtered) caller could seed a short-lived under-filled block list.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (roleRow?.role !== "admin") throw new Error("Not authorized");

  // 1. Get already-invited participant IDs for this session
  const { data: sessionParts } = await supabase
    .from("session_participants")
    .select("participant_id")
    .eq("session_id", sessionId);
  const alreadyInvitedIds = (sessionParts ?? []).map((p: { participant_id: string }) => p.participant_id);
  const alreadyInvitedSet = new Set(alreadyInvitedIds);

  // 2. Get blacklisted user IDs from roles table (used to flag, not exclude)
  const { data: blacklistedRoles } = await supabase
    .from("roles")
    .select("user_id")
    .eq("role", "blacklisted");
  const blacklistedIds = (blacklistedRoles ?? []).map((r: { user_id: string }) => r.user_id);
  const blacklistedSet = new Set(blacklistedIds);

  // 3. Participants already spent on this session's cases or their follow-up
  //    chains. Same rule the recommended list uses, so the two agree.
  //    `priorInvolvement` is the rest of the chain's history — people who were
  //    invited but never sat, who stay invitable.
  const { blockedIds: lineageBlockedIds, priorInvolvement } = splitLineageInvolvement(
    await getSessionLineageInvolvement(supabase, sessionId)
  );

  // 3b. Participants with no login account — they can never be invited (the
  //     insert would fail FK 23503), so they are surfaced greyed-out rather than
  //     offered. See lib/participant/loginAccount.
  const noLoginSet = await getAllIdsWithoutLogin();
  const noLoginIds = Array.from(noLoginSet);

  const { count } = await supabase
    .from("jury_participants")
    .select("*", { count: "exact", head: true });
  const testTable = count === 0 || count === null ? "oldData" : "jury_participants";
  const isOldData = testTable === "oldData";
  const idField = isOldData ? "id" : "user_id";

  const nowIso = new Date().toISOString();

  type SearchResultRow = {
    user_id?: string | null;
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
    date_of_birth?: string | null;
    political_affiliation?: string | null;
  };
  const mapRow = (
    p: SearchResultRow,
    flags: {
      blacklisted?: boolean;
      lineageBlocked?: boolean;
      inactive?: boolean;
      noAccount?: boolean;
    } = {}
  ) => {
    const id = p.user_id || p.id;
    return {
      id,
      first_name: p.first_name,
      last_name: p.last_name,
      city: p.city,
      date_of_birth: p.date_of_birth,
      political_affiliation: p.political_affiliation,
      blacklisted: flags.blacklisted ?? false,
      lineageBlocked: flags.lineageBlocked ?? false,
      inactive: flags.inactive ?? false,
      noAccount: flags.noAccount ?? false,
      // Non-blocking history on this lineage, so a selectable row can still say
      // "previously invited — declined" rather than looking untouched.
      priorInvolvement: (id ? priorInvolvement.get(id) : undefined) ?? null,
    };
  };

  // ── Eligible participants (active, approved, not blacklisted, not in lineage, not already invited) ──
  const eligibleExcludeIds = Array.from(
    new Set([...alreadyInvitedIds, ...blacklistedIds, ...lineageBlockedIds, ...noLoginIds])
  );
  let q = supabase.from(testTable).select("*");
  if (!isOldData) {
    q = q
      .or(`eligible_after_at.is.null,eligible_after_at.lte.${nowIso}`)
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null)
      .eq("reactivation_status", ACTIVE_STATUS);
  }
  if (eligibleExcludeIds.length > 0) {
    q = q.not(idField, "in", `(${eligibleExcludeIds.map((id) => `"${id}"`).join(",")})`);
  }
  if (query.trim()) {
    const term = query.trim().toLowerCase();
    q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  }
  const { data: eligibleData, error } = await q.limit(50);
  if (error) throw error;
  const eligible = ((eligibleData ?? []) as SearchResultRow[]).map((p) => mapRow(p));

  // Fetch a flagged group by id, honouring the same name search.
  const fetchFlagged = async (
    ids: string[],
    flags: { blacklisted?: boolean; lineageBlocked?: boolean; noAccount?: boolean }
  ) => {
    if (!ids.length) return [];
    let fq = supabase.from(testTable).select("*").in(idField, ids);
    if (query.trim()) {
      const term = query.trim().toLowerCase();
      fq = fq.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }
    const { data } = await fq.limit(50);
    return ((data ?? []) as SearchResultRow[]).map((p) => mapRow(p, flags));
  };

  // ── Lineage-blocked (already used on these cases or their follow-ups) ──
  const lineageToShow = lineageBlockedIds.filter(
    (id) => !alreadyInvitedSet.has(id) && !blacklistedSet.has(id) && !noLoginSet.has(id)
  );

  // ── Blacklisted matches (surfaced greyed-out, never invitable) ──
  const blacklistedToShow = blacklistedIds.filter((id) => !alreadyInvitedSet.has(id));

  // ── No login account (permanently un-invitable) ──
  const noLoginToShow = noLoginIds.filter(
    (id) => !alreadyInvitedSet.has(id) && !blacklistedSet.has(id)
  );

  // ── Non-active matches (reactivation_status not "yes") ──
  //    Surfaced greyed-out so an admin searching a known name sees *why* they
  //    aren't offered, rather than an empty result. Unlike the other two groups
  //    there is no id list to fetch by, so this queries on the status directly.
  const fetchInactive = async () => {
    if (isOldData) return [];
    let iq = supabase
      .from(testTable)
      .select("*")
      .eq("approved_by_admin", true)
      .is("blacklisted_at", null)
      .or(`reactivation_status.neq.${ACTIVE_STATUS},reactivation_status.is.null`);

    const excludeIds = Array.from(
      new Set([...alreadyInvitedIds, ...blacklistedIds, ...lineageBlockedIds, ...noLoginIds])
    );
    if (excludeIds.length > 0) {
      iq = iq.not(idField, "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
    }
    if (query.trim()) {
      const term = query.trim().toLowerCase();
      iq = iq.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }
    const { data } = await iq.limit(50);
    return ((data ?? []) as SearchResultRow[]).map((p) => mapRow(p, { inactive: true }));
  };

  const [lineageBlocked, blacklisted, inactive, noAccount] = await Promise.all([
    fetchFlagged(lineageToShow, { lineageBlocked: true }),
    fetchFlagged(blacklistedToShow, { blacklisted: true }),
    fetchInactive(),
    fetchFlagged(noLoginToShow, { noAccount: true }),
  ]);

  // Eligible first, then the greyed-out groups
  return [...eligible, ...lineageBlocked, ...blacklisted, ...inactive, ...noAccount];
}

/* =========================
   PARTICIPANTS WHO CAN NEVER BE INVITED
   Ids only, so the create-session search can grey them out. The check itself
   needs the service role (auth.users is not reachable through PostgREST), which
   is why the browser has to ask for it rather than query it.
========================= */
export async function getUninvitableParticipantIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (roleRow?.role !== "admin") throw new Error("Not authorized");

  return Array.from(await getAllIdsWithoutLogin());
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

  // 1. Fetch session (joining details, date)
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, zoom_link, location")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  const deliveryMode = await getSessionDeliveryModeOrDefault(sessionId);

  const sessionDateStr = new Date(session.session_date).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // 2. Fetch case IDs for session
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const caseIds = (sessionCases ?? []).map((sc) => sc.case_id);

  // 3. Fetch case title, description and legacy drive_link field
  const caseTitleMap = new Map<string, string>();
  const caseDescriptionMap = new Map<string, string | null>();
  const legacyDriveLinkMap = new Map<string, string>();
  if (caseIds.length) {
    const { data: caseRows } = await supabase
      .from("cases")
      .select("id, title, description, drive_link")
      .in("id", caseIds);
    for (const c of caseRows ?? []) {
      caseTitleMap.set(c.id, c.title);
      caseDescriptionMap.set(c.id, c.description ?? null);
      if (c.drive_link) legacyDriveLinkMap.set(c.id, c.drive_link);
    }
  }

  // 3b. Fetch uploaded documents for all cases and mint long-lived (≈always valid) signed URLs.
  //     The case-documents bucket stays private; a 10-year expiry keeps links working in the inbox.
  const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // ~10 years
  const docsByCase = new Map<string, { name: string; storage_path: string }[]>();
  const signedUrlByPath = new Map<string, string>();
  if (caseIds.length) {
    const { data: docRows } = await supabase
      .from("case_documents")
      .select("id, case_id, original_name, storage_path")
      .in("case_id", caseIds);

    const allPaths: string[] = [];
    for (const d of docRows ?? []) {
      const list = docsByCase.get(d.case_id) ?? [];
      list.push({ name: d.original_name, storage_path: d.storage_path });
      docsByCase.set(d.case_id, list);
      allPaths.push(d.storage_path);
    }

    if (allPaths.length) {
      const { data: signed } = await supabase.storage
        .from("case-documents")
        .createSignedUrls(allPaths, SIGNED_URL_TTL);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) signedUrlByPath.set(s.path, s.signedUrl);
      }
    }
  }

  // 4. Build one entry per case: name, description, documents, and Google Drive links
  //    (case_drive_links table + legacy drive_link field). Preserve session_cases order.
  const cases: PresenterCaseInfo[] = [];
  for (const caseId of caseIds) {
    const { data: links } = await supabase
      .from("case_drive_links")
      .select("url")
      .eq("case_id", caseId);

    const driveUrls = (links ?? []).map((l) => l.url);

    // Include legacy drive_link from cases table if not already in case_drive_links
    const legacyLink = legacyDriveLinkMap.get(caseId);
    if (legacyLink && !driveUrls.includes(legacyLink)) {
      driveUrls.unshift(legacyLink);
    }

    const documents = (docsByCase.get(caseId) ?? [])
      .map((d) => ({ name: d.name, url: signedUrlByPath.get(d.storage_path) ?? "" }))
      .filter((d) => d.url);

    cases.push({
      title: caseTitleMap.get(caseId) ?? "Unknown Case",
      description: caseDescriptionMap.get(caseId) ?? null,
      documents,
      driveUrls,
    });
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

  // 6. Send email. An in-person session gets the address block instead of the
  //    Zoom block — passing `offline` swaps the whole section, so a requestee is
  //    never shown a "Zoom link not set yet" warning for a session that will
  //    never have one.
  await sendPresenterInfoEmail(
    presenterEmail,
    sessionDateStr,
    session.zoom_link ?? null,
    cases,
    participants,
    isOffline(deliveryMode) ? { location: (session.location as string | null) ?? null } : undefined,
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
