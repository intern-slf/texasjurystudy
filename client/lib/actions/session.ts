"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendRescheduleEmail, sendSessionCreatedEmail, sendSessionCompletedEmail, sendPresenceConfirmedEmail, sendPresenceDeclinedEmail, sendZoomLinkEmail, sendSessionLocationEmail, sendWaitlistLocationEmail, sendPresenterInfoEmail, sendWaitlistZoomLinkEmail, sendWaitlistCalledInEmail, sendWaitlistWaitedOutEmail, sendWaitlistConfirmationEmail } from "@/lib/mail";
import type { PresenterParticipantInfo, PresenterCaseInfo } from "@/lib/mail";
import { checkAndNotifySessionFull, getSessionOccupancy } from "@/lib/participant/updateInviteStatus";
import { recordBackoutStrike } from "@/lib/actions/participantFlags";
import { requireAdmin } from "@/lib/requireAdmin";
import { inviteToSession, type InviteResult } from "@/lib/participant/invite";
import {
  getLineageInvolvementForCases,
  splitLineageInvolvement,
  type LineageInvolvement,
} from "@/lib/case-lineage";
import { ACTIVE_STATUS, isParticipantActive } from "@/lib/participant/activeStatus";
import { cooldownAfterSession } from "@/lib/participant/sessionStart";
import { centralToday } from "@/lib/centralToday";
import {
  WAITLISTED_STATUS,
  isWaitlisted,
  assignSlot,
  sessionLengthHours,
  seatPayoutCents,
  hourlyRateCents,
  waitlistHoldMinutes,
  waitlistWaitFeeCents,
  formatCents,
} from "@/lib/participant/waitlist";
import { assertCasesShareDeliveryMode, isOffline } from "@/lib/case/deliveryMode";
import { getSessionDeliveryModeOrDefault } from "@/lib/case/getSessionDeliveryMode";
import { getAllIdsWithoutLogin } from "@/lib/participant/loginAccount";
import { revalidatePath } from "next/cache";
import { CENTRAL_TIME_ZONE, formatSessionDate, formatSessionSpan, localToUTC, localToUTCTime, sessionSpan } from "@/lib/timezone";

/* =========================
   CREATE SESSION
   Every export in this file that changes a session, its cases or its
   invitations, or emails anyone about them, is an admin action and starts with
   requireAdmin(): as server actions they can be called by anyone signed in, with
   any session's id.
========================= */
export async function createSession(
  sessionDate: string,
  /** The venue of an in-person session. Saved now so the invitations can carry it. */
  location?: string | null,
) {
  const adminId = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      session_date: sessionDate,
      created_by: adminId,
      ...(location?.trim() ? { location: location.trim() } : {}),
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
) {
  await requireAdmin();
  const supabase = await createClient();

  await assertSessionDeliveryModeFits(
    supabase,
    sessionId,
    cases.map((c) => c.caseId),
  );

  // The admin picks the times in Central Time, the zone participants and firms
  // are told. The form used to send the browser's zone, so an admin outside
  // Texas stored times everyone was then emailed hours off.
  const tz = CENTRAL_TIME_ZONE;
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
   The admin's invite, from the new-session form and Invite More. The work is
   inviteToSession (lib/participant/invite.ts), which isn't a server action; the
   firm's own "Add participant" calls it too, after its own checks.
========================= */
export async function inviteParticipants(
  sessionId: string,
  participantIds: string[],
  sessionDate?: string
): Promise<InviteResult> {
  // It emails invitations, and its guards read participants' names with the
  // service role, so only an admin may call it. Refused as a result rather than a
  // throw, like every other way an invite can fail.
  try {
    await requireAdmin();
  } catch (err) {
    return {
      ok: false,
      invited: 0,
      skipped: { blacklisted: 0, inactive: 0, noAccount: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return inviteToSession(sessionId, participantIds, sessionDate);
}

/* =========================
   NOTIFY REQUESTEES SESSION CREATED
========================= */
export async function notifyRequesteesSessionCreated(
  sessionId: string,
  caseIds: string[],
  sessionDate: string,
) {
  // Otherwise anyone with a case of their own could have support@ send them a
  // "Session Scheduled" email, with a count of their choosing.
  await requireAdmin();
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

  // The requestee travels to an in-person session too, so they get the venue.
  let location: string | null = null;
  if (offline) {
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select("location")
      .eq("id", sessionId)
      .maybeSingle();
    location = (sessionRow?.location as string | null | undefined) ?? null;
  }

  // Fetch session times
  const { data: sessionCaseRows } = await supabase
    .from("session_cases")
    .select("case_id, start_time, end_time")
    .eq("session_id", sessionId);

  // Read on the session's date as instants, so an evening session crossing
  // midnight UTC keeps its first case (sorting the stored times as text didn't).
  const sessionSpanText = formatSessionSpan(
    sessionDate,
    (sessionCaseRows ?? []).map((r) => r.start_time),
    (sessionCaseRows ?? []).map((r) => r.end_time),
  );
  const timeStr = sessionSpanText ? `${sessionSpanText} CT` : "TBD";

  const dateStr = formatSessionDate(sessionDate);

  // Several firms' cases can share one session, so each firm is also told when
  // its own case runs, not just the span of the whole session.
  const caseTimeById = new Map<string, string>();
  for (const r of sessionCaseRows ?? []) {
    const caseSpan = formatSessionSpan(sessionDate, [r.start_time], [r.end_time]);
    if (r.case_id && caseSpan) caseTimeById.set(r.case_id, `${caseSpan} CT`);
  }

  // Group cases by requestee (one email per requestee)
  const requesteeMap = new Map<string, { titles: string[]; times: string[] }>();
  for (const c of caseRows) {
    if (!c.user_id) continue;
    if (!requesteeMap.has(c.user_id)) requesteeMap.set(c.user_id, { titles: [], times: [] });
    const entry = requesteeMap.get(c.user_id)!;
    entry.titles.push(c.title);
    entry.times.push(caseTimeById.get(c.id) ?? "TBD");
  }

  for (const [requesteeId, { titles, times }] of requesteeMap) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requesteeId);
      const email = userData?.user?.email;
      if (email) {
        await sendSessionCreatedEmail(email, titles, dateStr, timeStr, times, offline, location);
        console.log(`[notifyRequestees] Session created email sent to ${email}`);
      }
    } catch (e) {
      console.error(`[notifyRequestees] Failed to email requestee ${requesteeId}:`, e);
    }
  }
}

/**
 * Bring the two values DERIVED from a session's schedule back in line after the
 * schedule moves.
 *
 * `payout_cents` and `jury_participants.eligible_after_at` are both snapshots
 * taken when someone accepted, computed from the session_cases rows as they
 * stood at that moment. `rescheduleSession` rewrites those rows — the modal
 * edits each case's start AND end time, not just the date — so both snapshots
 * go stale the moment a reschedule changes the duration. Nothing else in the
 * app, and no database trigger, ever revisits them.
 *
 * Left unfixed this pays two people differently for the same hours: a seat is
 * priced at accept time, while `callInWaitlistParticipant` prices a called-in
 * waitlister live from the current session_cases. Reschedule 3h → 5h and the
 * seat is still on 3h while the waitlister gets 5h.
 *
 * WHAT IS REPRICED, and what deliberately is not:
 *
 *   accepted (incl. called_in)  repriced — the only hours-derived payout
 *   waitlisted / waited_out     NOT — a flat per-mode fee that takes no hours
 *                               argument; recomputing it as hours × rate would
 *                               turn a $30 waiting fee into a full session
 *   payout_cents IS NULL        NOT — the column was added 2026-08-20 with no
 *                               backfill, so older accepted rows are null.
 *                               Repricing on status alone would ORIGINATE money
 *                               on historical sessions that never had a payout
 *   declined / rejected         NOT — already null, and excluded by both rules
 *
 * Two further guards, both of which have a real failure mode behind them:
 *
 *   hours <= 0   `sessionLengthHours` returns 0 for missing or unparseable
 *                times, and seatPayoutCents(0) is 0 — so a failed read would
 *                silently write $0 to every seat. Bail instead.
 *   past date    there is no paid flag, no paid_at and no payout ledger
 *                anywhere in the schema, and Reschedule is reachable from the
 *                Past tab. Rewriting the amount on a session that has already
 *                happened could silently contradict money already sent by hand.
 *                Cooldown is still corrected — for a past session it is inert.
 */
async function resyncScheduleDerivedValues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  newDate: string,
): Promise<SessionCaseTimes[]> {
  const { data: caseRows, error: caseErr } = await supabase
    .from("session_cases")
    .select("case_id, start_time, end_time")
    .eq("session_id", sessionId);

  if (caseErr || !caseRows?.length) {
    console.error(
      `[resyncScheduleDerived] Could not re-read session_cases for ${sessionId}; ` +
      `payouts and cooldowns left untouched.`,
      caseErr?.message,
    );
    return [];
  }

  const starts = caseRows.map((r) => r.start_time as string | null);
  const ends = caseRows.map((r) => r.end_time as string | null);
  const hours = sessionLengthHours(starts, ends, newDate);

  // Everyone holding a seat. Called-in waitlisters are 'accepted' too, which is
  // exactly right — their payout is hours-derived like any other seat.
  const { data: seated } = await supabase
    .from("session_participants")
    .select("participant_id, payout_cents")
    .eq("session_id", sessionId)
    .eq("invite_status", "accepted");

  if (!seated?.length) return caseRows;

  // --- money ---
  const isPast = newDate < centralToday();
  const repriceIds = seated
    .filter((r) => typeof r.payout_cents === "number")
    .map((r) => r.participant_id);

  if (hours <= 0) {
    console.error(
      `[resyncScheduleDerived] Session ${sessionId} has unreadable times after ` +
      `reschedule (hours=0); refusing to reprice ${repriceIds.length} seat(s) to $0.`,
    );
  } else if (isPast) {
    console.warn(
      `[resyncScheduleDerived] Session ${sessionId} is dated in the past; ` +
      `leaving ${repriceIds.length} payout(s) alone — they may already have been paid.`,
    );
  } else if (repriceIds.length) {
    const mode = await getSessionDeliveryModeOrDefault(sessionId);
    const payout = seatPayoutCents(hours, mode);
    const { error } = await supabase
      .from("session_participants")
      .update({ payout_cents: payout })
      .eq("session_id", sessionId)
      .in("participant_id", repriceIds);
    if (error) {
      console.error(`[resyncScheduleDerived] Reprice failed for ${sessionId}:`, error.message);
    } else {
      console.log(
        `[resyncScheduleDerived] Repriced ${repriceIds.length} seat(s) on ${sessionId} ` +
        `to ${formatCents(payout)} (${hours}h, ${mode}).`,
      );
    }
  }

  // --- cooldown ---
  // Anchored to the session's end, so moving the session must move it. Left
  // stale and moved LATER, a participant becomes eligible again before the
  // session they are still committed to, and can be invited onto a second one.
  const cooldown = cooldownAfterSession(newDate, starts, ends);
  if (cooldown) {
    const { error } = await supabaseAdmin
      .from("jury_participants")
      .update({ eligible_after_at: cooldown })
      .in("user_id", seated.map((r) => r.participant_id));
    if (error) {
      console.error(`[resyncScheduleDerived] Cooldown update failed:`, error.message);
    }
  }
  return caseRows;
}

/** A session's case times as read back after a reschedule: the stored UTC times. */
type SessionCaseTimes = { case_id?: string | null; start_time: string | null; end_time: string | null };

/* =========================
   RESCHEDULE SESSION
========================= */
export async function rescheduleSession(
  sessionId: string,
  newDate: string, // "YYYY-MM-DD"
  caseUpdates: { caseId: string; start: string; end: string }[],
) {
  // Emails everyone on the session a new date and rewrites their cooldowns with
  // the service role, so check for an admin before anything else.
  await requireAdmin();
  const supabase = await createClient();

  // 1. Update session date
  const { error: sessionError } = await supabase
    .from("sessions")
    .update({ session_date: newDate })
    .eq("id", sessionId);

  if (sessionError) throw sessionError;

  // 2. Update session_cases times + cases.admin_scheduled_at. The modal's times
  //    are Central Time, as everyone is told; the admin's browser zone used to
  //    be sent instead.
  const tz = CENTRAL_TIME_ZONE;
  const written: SessionCaseTimes[] = [];
  for (const cu of caseUpdates) {
    const startUtc = localToUTCTime(newDate, cu.start.slice(0, 5), tz);
    const endUtc   = localToUTCTime(newDate, cu.end.slice(0, 5),   tz);
    written.push({ case_id: cu.caseId, start_time: startUtc, end_time: endUtc });

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

  // The times just changed, so anything derived from them is now stale. The
  // times read back cover every case in the session; if that read failed, the
  // emails fall back on the ones just written.
  const readBack = await resyncScheduleDerivedValues(supabase, sessionId, newDate);
  const newTimes = readBack.length ? readBack : written;

  // The emails give the new time as well as the date. With the date alone, a
  // move to another time on the same day was announced as the same date, and
  // the time everyone had been sent before stood uncorrected.
  const newDateStr = formatSessionDate(newDate);
  const sessionSpanText = formatSessionSpan(
    newDate,
    newTimes.map((r) => r.start_time),
    newTimes.map((r) => r.end_time),
  );
  const sessionTimeStr = sessionSpanText ? `${sessionSpanText} CT` : null;

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
        await sendRescheduleEmail(userData.user.email, newDateStr, "participant", sessionTimeStr);
      }
    } catch (e) {
      console.error(`Reschedule email failed for participant ${row.participant_id}:`, e);
    }
  }

  // 4. Notify requestee(s) — one email per firm, with the session's time and
  //    each of the firm's own cases' times, as the Session Scheduled email does.
  const caseIds = caseUpdates.map((cu) => cu.caseId);
  if (caseIds.length) {
    const { data: caseRows } = await supabase
      .from("cases")
      .select("id, title, user_id")
      .in("id", caseIds);

    const caseTimeById = new Map<string, string>();
    for (const r of newTimes) {
      const caseSpan = formatSessionSpan(newDate, [r.start_time], [r.end_time]);
      if (r.case_id && caseSpan) caseTimeById.set(r.case_id, `${caseSpan} CT`);
    }

    const casesByRequestee = new Map<string, { title: string; time: string }[]>();
    for (const c of caseRows ?? []) {
      if (!c.user_id) continue;
      const list = casesByRequestee.get(c.user_id) ?? [];
      list.push({ title: c.title ?? "", time: caseTimeById.get(c.id) ?? "TBD" });
      casesByRequestee.set(c.user_id, list);
    }

    for (const [requesteeId, firmCases] of casesByRequestee) {
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(requesteeId);
        if (userData?.user?.email) {
          await sendRescheduleEmail(userData.user.email, newDateStr, "requestee", sessionTimeStr, firmCases);
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
   ADMIN RESPOND ON BEHALF OF PARTICIPANT
   Participants answer their own invitations through updateInviteStatus
   (lib/participant/updateInviteStatus.ts).
========================= */
export async function adminRespondOnBehalf(
  sessionId: string,
  participantId: string,
  action: "accepted" | "rejected"
) {
  // Seats or declines someone and emails them, so only an admin may call it.
  await requireAdmin();
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

  // Every case's times, read on the session's date: they price the seat here and
  // go into the email below.
  type CaseTimes = { start_time: string | null; end_time: string | null; sessions?: unknown };
  let caseTimes: CaseTimes[] = [];
  let caseTimesDate: string | null = null;

  if (action === "accepted") {
    const { data: caseTimeRows } = await supabase
      .from("session_cases")
      .select("start_time, end_time, sessions(session_date)")
      .eq("session_id", sessionId);

    caseTimes = (caseTimeRows ?? []) as CaseTimes[];
    const embedded = caseTimes[0]?.sessions as { session_date?: string | null } | { session_date?: string | null }[] | null | undefined;
    caseTimesDate = (Array.isArray(embedded) ? embedded[0]?.session_date : embedded?.session_date) ?? null;
    onBehalfHours = sessionLengthHours(
      caseTimes.map((r) => r.start_time),
      caseTimes.map((r) => r.end_time),
      caseTimesDate,
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
      // The whole session in Central Time, like every other session email. It
      // used to print one case's stored UTC times ("16:00:00 – 17:00:00").
      const span = formatSessionSpan(
        session.session_date ?? caseTimesDate,
        caseTimes.map((r) => r.start_time),
        caseTimes.map((r) => r.end_time),
      );
      const timeStr = span ? `${span} CT` : "See your dashboard for details";

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
        await sendPresenceConfirmedEmail(
          email, firstName, session.session_date, timeStr, offline, offline ? session.location : null,
        );
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
      sessionDate,
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

/**
 * Call a waitlisted participant into the meeting. Flips them to a real seat —
 * this deliberately bypasses `participant_cap`, because the seat they are
 * filling belongs to someone who did not show up and is not handed back
 * automatically. The accepted count can therefore read above the cap.
 */
export async function callInWaitlistParticipant(sessionId: string, participantId: string) {
  // Seats a waitlister, sets their cooldown with the service role and emails them
  // a payment amount: admin-only.
  await requireAdmin();
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
        formatSessionDate(ctx.sessionDate),
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
  // Records the waiting fee and emails the waitlister that it is being paid:
  // admin-only.
  await requireAdmin();
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
        formatSessionDate(ctx.sessionDate),
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
  // Three strikes blacklist the participant, and as a server action this is
  // reachable by anyone signed in, so check for an admin before striking anyone.
  const adminId = await requireAdmin();

  await recordBackoutStrike(participantId, sessionId, adminId);

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
  // Writes with the service role, and a lower cap can decline every pending
  // invitee and email them, so check for an admin first, then refuse a cap the
  // editor would never send (it stops at 1).
  await requireAdmin();
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("The participant cap must be a whole number of at least 1.");
  }

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
  // Emails each firm on the session that it is over: admin-only.
  await requireAdmin();
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

  const sessionDateStr = formatSessionDate(session.session_date);

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
  const [{ data: rows }, { data: session }] = await Promise.all([
    supabase.from("session_cases").select("start_time, end_time").eq("session_id", sessionId),
    // The times are read on the session's date: a clock change between now and
    // then moves them by an hour.
    supabase.from("sessions").select("session_date").eq("id", sessionId).maybeSingle(),
  ]);

  if (!rows?.length) return undefined;

  const span = formatSessionSpan(
    session?.session_date as string | null | undefined,
    rows.map((r) => r.start_time),
    rows.map((r) => r.end_time),
  );
  return span ? `${span} CT` : undefined;
}

export async function sendZoomLink(formData: FormData) {
  // Emails every seated and waitlisted participant the link it is given, so check
  // for an admin before anything else, the service-role mode lookup included.
  await requireAdmin();
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

   Saves the venue address and emails it to everyone already holding a seat.
   The address is normally entered when the session is created, and every
   invitation carries it (see inviteParticipants), so this is how it is changed
   afterwards, or added to a session that was created without one. Waitlisters
   are included and get their own template, exactly as the Zoom path does — an
   in-person reserve slot is held at the venue, so the address matters to them
   as much as to a seated participant.
========================= */
export async function sendSessionLocation(formData: FormData) {
  // Emails every seated and waitlisted participant the address it is given, so
  // check for an admin before anything else, as sendZoomLink does.
  await requireAdmin();
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
  // Swaps a session's cases and emails the incoming firm: admin-only.
  await requireAdmin();
  const supabase = await createClient();

  // When the incoming case ends, for its admin_scheduled_at. The times come from
  // session_cases, so they are UTC: read on the session's Central date, an evening
  // end falls on the next UTC day, where "session date + end Z" put it a day early.
  // Worked out before anything is written, so unreadable times change nothing.
  const caseEnd = sessionSpan(sessionDate, [startTime], [endTime])?.end;
  if (!caseEnd) throw new Error("This case's start and end times could not be read.");

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

  // 4. Set admin_scheduled_at to when the case ends
  await supabase
    .from("cases")
    .update({ admin_scheduled_at: caseEnd.toISOString(), schedule_status: null })
    .eq("id", newCaseId);

  // 5. Notify new requestee — same as rescheduleSession, with when its case runs
  const newDateStr = formatSessionDate(sessionDate);
  const caseSpan = formatSessionSpan(sessionDate, [startTime], [endTime]);

  const { data: caseRow } = await supabase
    .from("cases")
    .select("user_id, title")
    .eq("id", newCaseId)
    .single();

  if (caseRow?.user_id) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(caseRow.user_id);
      if (userData?.user?.email) {
        await sendRescheduleEmail(userData.user.email, newDateStr, "requestee", null, [
          { title: caseRow.title ?? "", time: caseSpan ? `${caseSpan} CT` : "TBD" },
        ]);
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
  // Mails the session's case files, links and every seated participant's details
  // to whatever address it is given, so only an admin may call it.
  await requireAdmin();
  const supabase = await createClient();

  // 1. Fetch session (joining details, date)
  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, zoom_link, location")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  const deliveryMode = await getSessionDeliveryModeOrDefault(sessionId);

  const sessionDateStr = formatSessionDate(session.session_date);

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
