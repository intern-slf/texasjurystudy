/* =========================
   SESSION WAITLIST

   Once accepted seats reach `sessions.participant_cap`, the next people to
   accept land on the waitlist instead of being turned away. They hold for a
   window, and one of two things happens:

     called in  -> paid the hourly rate for the FULL session length, and their
                   invite flips to 'accepted'
     waited out -> paid a flat waiting fee, and the invite stays 'waitlisted'

   An admin records which happened from the session page — the call-in itself
   happens in the room or in Zoom, not in the app.

   Both formats have a waitlist, but the terms differ, because holding a reserve
   slot in person costs the participant a journey rather than fifteen minutes at
   a desk:

                        online            in person
     hold window        15 minutes        30 minutes (arrive 15 min early)
     waited-out fee     $10.00 flat       $30.00 flat
     called-in rate     $30.00/hr         $40.00/hr

   Read the two per-mode values through `waitlistHoldMinutes()` and
   `waitlistWaitFeeCents()` rather than the bare constants, or an in-person
   waitlister gets quoted the online terms.
========================= */

import { isOffline, type DeliveryMode } from "@/lib/case/deliveryMode";

/** `session_participants.invite_status` value for a reserve slot. */
export const WAITLISTED_STATUS = "waitlisted";

/** Paid per hour of session length, to seated and called-in participants alike. */
export const HOURLY_RATE_CENTS = 3_000; // $30.00, online

/**
 * In-person rate. Higher because attending costs the participant a commute, a
 * parking spot and a whole afternoon rather than an hour at a desk.
 */
export const OFFLINE_HOURLY_RATE_CENTS = 4_000; // $40.00, in person

/** Flat fee for an online waitlister who held the full window and was never called in. */
export const WAITLIST_WAIT_FEE_CENTS = 1_000; // $10.00, online

/** Flat fee for an in-person waitlister — they travelled to the venue to hold it. */
export const OFFLINE_WAITLIST_WAIT_FEE_CENTS = 3_000; // $30.00, in person

/** How long an online waitlister is asked to hold before the flat fee applies. */
export const WAITLIST_HOLD_MINUTES = 15;

/** How long an in-person waitlister holds on site before the flat fee applies. */
export const OFFLINE_WAITLIST_HOLD_MINUTES = 30;

/** How early everyone attending in person is asked to arrive, for check-in. */
export const OFFLINE_ARRIVE_EARLY_MINUTES = 15;

/** Used when a session row predates `waitlist_cap`. */
export const DEFAULT_WAITLIST_CAP = 2;

export type WaitlistOutcome = "called_in" | "waited_out";

/** What a participant earns per hour of session, by how the session is run. */
export function hourlyRateCents(deliveryMode?: DeliveryMode | string | null): number {
  return isOffline(deliveryMode) ? OFFLINE_HOURLY_RATE_CENTS : HOURLY_RATE_CENTS;
}

/**
 * How many reserve slots a session offers. Both formats have a waitlist, so this
 * is simply the stored cap with a default for rows that predate the column — the
 * per-mode difference is in the hold window and the waiting fee, not the size.
 */
export function waitlistCapFor(
  _deliveryMode: DeliveryMode | string | null | undefined,
  storedCap?: number | null,
): number {
  return storedCap ?? DEFAULT_WAITLIST_CAP;
}

/** How long a waitlister holds before the flat waiting fee is earned. */
export function waitlistHoldMinutes(deliveryMode?: DeliveryMode | string | null): number {
  return isOffline(deliveryMode) ? OFFLINE_WAITLIST_HOLD_MINUTES : WAITLIST_HOLD_MINUTES;
}

/** Flat fee for holding the full window without being called in. */
export function waitlistWaitFeeCents(deliveryMode?: DeliveryMode | string | null): number {
  return isOffline(deliveryMode)
    ? OFFLINE_WAITLIST_WAIT_FEE_CENTS
    : WAITLIST_WAIT_FEE_CENTS;
}

export function isWaitlisted(inviteStatus?: string | null): boolean {
  return inviteStatus === WAITLISTED_STATUS;
}

/** "$30.00" / "$90.00" — the one place cents become display text. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Total session length in hours, spanning the earliest case start to the latest
 * case end. `session_cases` times are stored UTC, and both ends shift together,
 * so a plain difference is correct without any timezone handling.
 *
 * Returns 0 when the times are missing or unparseable — the caller decides
 * whether that means "no payout yet" or "leave the amount alone".
 */
export function sessionLengthHours(
  startTimes: readonly (string | null | undefined)[],
  endTimes: readonly (string | null | undefined)[],
): number {
  const toMinutes = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };

  const starts = startTimes.map(toMinutes).filter((v): v is number => v !== null);
  const ends = endTimes.map(toMinutes).filter((v): v is number => v !== null);
  if (!starts.length || !ends.length) return 0;

  const first = Math.min(...starts);
  // Roll each end past midnight BEFORE taking the maximum. Comparing the raw
  // maximum against the start would miss a session like 19:30→22:30 plus
  // 22:30→00:30: max() picks 22:30 over 00:30 and the wrap is never seen, so the
  // session measures 3 hours instead of 5.
  const last = Math.max(...ends.map((end) => (end < first ? end + 24 * 60 : end)));

  return Math.max(0, (last - first) / 60);
}

/** What a seated (or called-in) participant is owed for a session of this length. */
export function seatPayoutCents(
  hours: number,
  deliveryMode?: DeliveryMode | string | null,
): number {
  return Math.round(hours * hourlyRateCents(deliveryMode));
}

/** Payout for a recorded waitlist outcome, at this session's terms. */
export function waitlistPayoutCents(
  outcome: WaitlistOutcome,
  hours: number,
  deliveryMode?: DeliveryMode | string | null,
): number {
  return outcome === "called_in"
    ? seatPayoutCents(hours, deliveryMode)
    : waitlistWaitFeeCents(deliveryMode);
}

/**
 * Which slot a newly-accepting participant gets.
 *
 * `seat` until the cap is reached, then `waitlist` until the waitlist cap is
 * reached, then `full` — at which point the existing session-full path takes
 * over and turns them away.
 */
export function assignSlot(opts: {
  acceptedCount: number;
  waitlistCount: number;
  participantCap: number;
  waitlistCap: number;
}): "seat" | "waitlist" | "full" {
  if (opts.acceptedCount < opts.participantCap) return "seat";
  if (opts.waitlistCount < opts.waitlistCap) return "waitlist";
  return "full";
}
