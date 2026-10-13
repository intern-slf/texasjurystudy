import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, emailWrapper, venueAddressBlock } from "@/lib/mail";
import { generateEmailActionToken } from "@/lib/emailActionToken";
import { ACTIVE_STATUS, isActiveStatus } from "@/lib/participant/activeStatus";
import {
  OFFLINE_ARRIVE_EARLY_MINUTES,
  formatCents,
  hourlyRateCents,
  waitlistHoldMinutes,
  waitlistWaitFeeCents,
} from "@/lib/participant/waitlist";
import { isOffline } from "@/lib/case/deliveryMode";
import { getSessionDeliveryModeOrDefault } from "@/lib/case/getSessionDeliveryMode";
import { NO_LOGIN_REASON, getIdsWithoutLogin } from "@/lib/participant/loginAccount";
import { revalidatePath } from "next/cache";

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

/**
 * Invites participants to a session: one pending session_participants row each, and
 * an invitation email with accept and decline links.
 *
 * Deliberately not a server action (no "use server"), so it can't be called from the
 * browser: it trusts the session and the ids it is given, and its guards read
 * participants' names and emails with the service role. Its callers check who is
 * asking: inviteParticipants in lib/actions/session.ts (admins: the new-session form
 * and Invite More) and requesteeAddParticipants in lib/actions/requesteeParticipant.ts
 * (the firm that owns a case in the session, after its own case and lineage checks).
 *
 * Its own guards cover blacklisted, inactive and login-less participants only. It does
 * not check approval, the cooldown after a session, people already on the session or a
 * session in the past: the admin screens only offer eligible people, but the firm's path
 * doesn't check those yet. That is safe today only because RLS refuses the firm's
 * session_participants insert (the firm's Add participant button has failed since May
 * for that reason). Add those checks to requesteeAddParticipants before making its
 * insert succeed (F28 in docs/rls-policies.md).
 */
export async function inviteToSession(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
): Promise<InviteResult> {
  try {
    return await inviteToSessionInner(sessionId, participantIds, sessionDate);
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

async function inviteToSessionInner(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
): Promise<InviteResult> {
  const supabase = await createClient();

  // An in-person invitation is a different ask: it costs the invitee a journey,
  // it pays a different rate, and its waitlist has its own hold window and fee.
  // All of that has to be in the email, or people accept the wrong thing.
  const deliveryMode = await getSessionDeliveryModeOrDefault(sessionId);
  const offline = isOffline(deliveryMode);

  // ── Hard guard: an in-person invitation must say where. Whether someone can
  //    attend depends on where the venue is, so the address goes out with the
  //    invite rather than after they accept, and an in-person session without
  //    one cannot invite anybody yet. Read with the service role: a requestee
  //    reaches here too, and an RLS-hidden row must not read as "no address".
  let venue: string | null = null;
  if (offline) {
    const { data: venueRow } = await supabaseAdmin
      .from("sessions")
      .select("location")
      .eq("id", sessionId)
      .maybeSingle();
    venue = (venueRow?.location as string | null | undefined)?.trim() || null;

    if (!venue) {
      console.warn(
        `[inviteParticipants] Refused ${participantIds.length} invite(s) to in-person session ` +
        `${sessionId}: no venue address saved`
      );
      return {
        ok: false,
        invited: 0,
        skipped: { blacklisted: 0, inactive: 0, noAccount: 0 },
        error:
          "Nobody was invited — this in-person session has no venue address yet, and the " +
          "invitations have to say where it is. An admin can add it in the Venue Address box " +
          "on the sessions page.",
      };
    }
  }

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
            "location": ${offline && venue
              ? `{ "@type": "Place", "name": "In-Person", "address": ${JSON.stringify(venue).replace(/</g, "\\u003c")} }`
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

          ${offline && venue ? `
          ${venueAddressBlock(venue)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 24px;">
            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0 0 8px;font-size:14px;color:#166534;">
                  <strong>This session is held in person</strong> at the address above. You will need to travel to the venue, so please only accept if you can be there for the full session.
                </p>
                <p style="margin:0 0 8px;font-size:13px;color:#166534;">
                  Bring your <strong>Texas State ID</strong> and plan to arrive <strong>${OFFLINE_ARRIVE_EARLY_MINUTES} minutes early</strong> for check-in.
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
