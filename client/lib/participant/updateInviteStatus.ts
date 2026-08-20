"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendInviteAcceptedConfirmationEmail,
  sendInviteDeclinedConfirmationEmail,
  sendSessionFullEmail,
  sendZoomLinkEmail,
  sendWaitlistConfirmationEmail,
  sendWaitlistZoomLinkEmail,
} from "@/lib/mail";
import { isActiveStatus } from "@/lib/participant/activeStatus";
import { hasSessionStarted, cooldownAfterSession } from "@/lib/participant/sessionStart";
import {
  WAITLISTED_STATUS,
  DEFAULT_WAITLIST_CAP,
  HOURLY_RATE_CENTS,
  WAITLIST_WAIT_FEE_CENTS,
  WAITLIST_HOLD_MINUTES,
  assignSlot,
  sessionLengthHours,
  seatPayoutCents,
  formatCents,
} from "@/lib/participant/waitlist";

/* =========================
   CHECK IF SESSION HAS REACHED ITS PARTICIPANT CAP

   Seats only — waitlisted rows are the reserve, not a seat, so they never count
   toward the cap. A struck participant DOES still count: they took the seat and
   the seat is not handed back automatically, so the cap arithmetic is unchanged
   by the strike system.
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

/* =========================
   SEAT / WAITLIST / FULL

   Reads both caps and both counts in one place so the accept path, the session
   page and the full-sweep all agree on where a session currently stands.
========================= */
export async function getSessionOccupancy(sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("participant_cap, waitlist_cap")
    .eq("id", sessionId)
    .single();

  const [{ count: acceptedCount }, { count: waitlistCount }] = await Promise.all([
    supabaseAdmin
      .from("session_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("invite_status", "accepted"),
    supabaseAdmin
      .from("session_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("invite_status", WAITLISTED_STATUS),
  ]);

  return {
    participantCap: session?.participant_cap ?? 10,
    waitlistCap: session?.waitlist_cap ?? DEFAULT_WAITLIST_CAP,
    acceptedCount: acceptedCount ?? 0,
    waitlistCount: waitlistCount ?? 0,
  };
}

export async function updateInviteStatus(
  sessionParticipantId: string,
  status: "accepted" | "declined"
) {
  console.log(`[updateInviteStatus] Updating ${sessionParticipantId} to ${status}`);

  // Which slot this accept landed in. Seats fill first; once the cap is reached
  // the next arrivals take waitlist slots, and only when those are gone is the
  // accept refused outright.
  let slot: "seat" | "waitlist" = "seat";
  let waitlistPosition: number | null = null;
  let sessionHours = 0;

  // 0. If accepting, check the session hasn't started, then active panel status,
  //    session capacity and required profile fields. Declining stays open at
  //    every stage — a late no is still worth recording.
  if (status === "accepted") {
    const { data: inviteRow } = await supabaseAdmin
      .from("session_participants")
      .select("session_id, participant_id")
      .eq("id", sessionParticipantId)
      .single();

    if (inviteRow) {
      // Checked first: once the first case is under way there is nothing left to
      // accept, so none of the other gates are worth reporting.
      const [{ data: sessionRow }, { data: caseRows }] = await Promise.all([
        supabaseAdmin
          .from("sessions")
          .select("session_date")
          .eq("id", inviteRow.session_id)
          .single(),
        supabaseAdmin
          .from("session_cases")
          .select("start_time, end_time")
          .eq("session_id", inviteRow.session_id),
      ]);

      type CaseTimes = { start_time: string | null; end_time: string | null };
      const times = (caseRows ?? []) as CaseTimes[];

      const started = hasSessionStarted(
        sessionRow?.session_date,
        times.map((r) => r.start_time),
      );
      if (started) {
        return { blocked: true, reason: "session_started" } as const;
      }

      sessionHours = sessionLengthHours(
        times.map((r) => r.start_time),
        times.map((r) => r.end_time),
      );

      const occupancy = await getSessionOccupancy(inviteRow.session_id);
      const assigned = assignSlot(occupancy);
      if (assigned === "full") {
        return { blocked: true, reason: "session_full" } as const;
      }
      slot = assigned;
      // 1-based, and taken from the live count rather than a stored max so a
      // waitlister who withdraws frees their number for the next person.
      if (slot === "waitlist") waitlistPosition = occupancy.waitlistCount + 1;

      const { data: profile } = await supabaseAdmin
        .from("jury_participants")
        .select("paypal_username, driver_license_number, driver_license_image_url, reactivation_status")
        .eq("user_id", inviteRow.participant_id)
        .single();

      // Only active panel members may attend. Checked before the profile gate so
      // someone who is no longer active isn't sent off to fill in a DL and PayPal
      // for a session they still can't join.
      if (profile && !isActiveStatus(profile.reactivation_status)) {
        return { blocked: true, reason: "inactive" } as const;
      }

      // Waitlisters are paid too, so the same profile requirements apply.
      const missing: string[] = [];
      if (!profile?.driver_license_number || !profile?.driver_license_image_url) missing.push("dl");
      if (!profile?.paypal_username) missing.push("paypal");

      if (missing.length > 0) {
        return { blocked: true, reason: "missing_profile", missing } as const;
      }
    }
  }

  const isWaitlistAccept = status === "accepted" && slot === "waitlist";

  // 1. Update invite status in session_participants and get the row back
  const { data: updatedRows, error } = await supabaseAdmin
    .from("session_participants")
    .update({
      invite_status: isWaitlistAccept ? WAITLISTED_STATUS : status,
      responded_at: new Date().toISOString(),
      ...(status === "accepted"
        ? {
            waitlist_position: waitlistPosition,
            // A seat is worth the hourly rate for the session; a waitlist slot is
            // worth the waiting fee until an admin records the real outcome.
            payout_cents: isWaitlistAccept
              ? WAITLIST_WAIT_FEE_CENTS
              : seatPayoutCents(sessionHours),
          }
        : {}),
    })
    .eq("id", sessionParticipantId)
    .select("session_id, participant_id");

  if (error) {
    console.error(`[updateInviteStatus] Error:`, error.message);
    throw new Error(error.message);
  }

  console.log(`[updateInviteStatus] Success:`, updatedRows);

  // What the caller needs to tell a seat apart from a reserve slot. Returned
  // from every exit below, because otherwise the accept/decline pages cannot
  // distinguish the two and a waitlister is told "You're In!".
  const outcome = isWaitlistAccept
    ? ({ waitlisted: true, position: waitlistPosition } as const)
    : undefined;

  if (!updatedRows?.length) return outcome;
  const { session_id, participant_id } = updatedRows[0];

  // 2. Only set cooldown + send accepted email when participant ACCEPTS
  if (status === "accepted") {
    try {
      const { data: session } = await supabaseAdmin
        .from("sessions")
        .select("session_date, zoom_link")
        .eq("id", session_id)
        .single();

      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("start_time, end_time")
        .eq("session_id", session_id);

      if (!session || !sessionCases?.length) return outcome;

      // Cooldown is for people who actually took a seat. A waitlister has not
      // used up their turn, so they stay eligible for other sessions until (and
      // unless) they are called into this one.
      if (!isWaitlistAccept) {
        const eligibleAfterAt = cooldownAfterSession(
          session.session_date as string,
          sessionCases.map((sc) => sc.start_time as string),
          sessionCases.map((sc) => sc.end_time as string),
        );

        if (eligibleAfterAt) {
          console.log("Cooldown set to:", eligibleAfterAt);

          const { error: cooldownErr } = await supabaseAdmin
            .from("jury_participants")
            .update({ eligible_after_at: eligibleAfterAt })
            .eq("user_id", participant_id);

          if (cooldownErr) {
            console.error("Cooldown update failed:", cooldownErr.message);
          }
        }
      }

      // Send acceptance confirmation email
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participant_id);
        const email = userData?.user?.email;
        if (email) {
          const formatCentralTime = (t: string) => {
            const [h, m] = t.split(":");
            const d = new Date();
            d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
            return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
          };

          // Span the FULL session: earliest start time -> latest end time across
          // every case. Using only sessionCases[0] dropped later cases, so a
          // 9–10 + 10–11 session showed "9 – 10" instead of "9 – 11".
          const starts = sessionCases.map((r) => r.start_time as string).filter(Boolean).sort();
          const ends = sessionCases.map((r) => r.end_time as string).filter(Boolean).sort();
          const timeStr =
            starts.length && ends.length
              ? `${formatCentralTime(starts[0])} – ${formatCentralTime(ends[ends.length - 1])} CT`
              : "See your dashboard for details";

          const firstName =
            userData?.user?.user_metadata?.first_name ||
            userData?.user?.user_metadata?.full_name?.split(" ")[0] ||
            "Participant";

          // A waitlister gets the waitlist arc instead of the seated one — they
          // must be told the hold rules and the two payment outcomes, and must
          // never receive a plain "You're In" confirmation.
          if (isWaitlistAccept) {
            await sendWaitlistConfirmationEmail(
              email,
              firstName,
              session.session_date as string,
              WAITLIST_HOLD_MINUTES,
              formatCents(HOURLY_RATE_CENTS),
              formatCents(WAITLIST_WAIT_FEE_CENTS),
              timeStr,
            );

            if (session.zoom_link) {
              await sendWaitlistZoomLinkEmail(
                email,
                firstName,
                session.session_date as string,
                session.zoom_link,
                WAITLIST_HOLD_MINUTES,
                formatCents(HOURLY_RATE_CENTS),
                formatCents(WAITLIST_WAIT_FEE_CENTS),
                timeStr,
              );
              console.log(`[updateInviteStatus] Sent waitlist zoom link to ${email} (link already saved)`);
            }
          } else {
            await sendInviteAcceptedConfirmationEmail(email, session.session_date as string, timeStr);

            // If zoom link is already saved, send it immediately to the new participant
            if (session.zoom_link) {
              await sendZoomLinkEmail(email, firstName, session.session_date as string, session.zoom_link, timeStr);
              console.log(`[updateInviteStatus] Sent zoom link email to ${email} (link already saved)`);
            }
          }
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

  return outcome;
}

/* =========================
   CHECK IF SESSION IS FULL & NOTIFY PENDING PARTICIPANTS
========================= */
export async function checkAndNotifySessionFull(sessionId: string) {
  // 1. Get session info including the notification flag
  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("session_date, session_full_notified")
    .eq("id", sessionId)
    .single();

  if (!session) return;
  if (session.session_full_notified) return; // already notified

  // 2. "Full" now means both the seats AND the waitlist are gone. Sweeping at
  //    the seat cap alone would decline everyone still pending, leaving nobody
  //    who could ever accept into a waitlist slot.
  const occupancy = await getSessionOccupancy(sessionId);
  if (occupancy.acceptedCount < occupancy.participantCap) return; // seats left
  if (occupancy.waitlistCount < occupancy.waitlistCap) return; // waitlist slots left

  // 3. Get all participants for this session, then filter out anyone who has
  //    already landed somewhere — accepted, declined, or on the waitlist.
  const { data: allRows } = await supabaseAdmin
    .from("session_participants")
    .select("participant_id, invite_status")
    .eq("session_id", sessionId);

  const pendingRows = (allRows ?? []).filter(
    (r) => !["accepted", "declined", "rejected", WAITLISTED_STATUS].includes(r.invite_status ?? "")
  );

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

  console.log(
    `[sessionFull] Session ${sessionId} is full — seats ${occupancy.acceptedCount}/${occupancy.participantCap}, ` +
      `waitlist ${occupancy.waitlistCount}/${occupancy.waitlistCap}. ` +
      `Notified ${pendingRows.length} pending participants.`
  );
}
