/* =========================
   SESSION WAITLIST

   Once accepted seats reach `sessions.participant_cap`, the next people to
   accept land on the waitlist instead of being turned away. They get the Zoom
   link and hold in the waiting room for 15 minutes:

     called in  -> paid the hourly rate for the FULL session length, and their
                   invite flips to 'accepted'
     waited out -> paid a flat waiting fee, and the invite stays 'waitlisted'

   An admin records which happened from the session page — the call-in itself
   happens in Zoom, not in the app.

   ---- IN-PERSON SESSIONS HAVE NO WAITLIST ----

   The whole arrangement rests on the reserve slot being nearly free to hold: you
   sit in a Zoom waiting room for 15 minutes and are paid $10 whether or not a
   seat opens. Asking someone to drive to a room for the same maybe is a
   different proposition, so an offline session's waitlist cap is forced to zero
   and the overflow takes the existing "session full" path instead. Nothing here
   is dead for offline — `waitlistCapFor` closes the door, and the call-in and
   waited-out actions refuse outright.
========================= */

import { isOffline, type DeliveryMode } from "@/lib/case/deliveryMode";

/** `session_participants.invite_status` value for a reserve slot. */
export const WAITLISTED_STATUS = "waitlisted";

/** Paid per hour of session length, to seated and called-in participants alike. */
export const HOURLY_RATE_CENTS = 3_000; // $30.00, online

/**
 * In-person rate. Higher because attending costs the participant a commute, a
 * parking spot and a whole afternoon rather than fifteen minutes at a desk.
 */
export const OFFLINE_HOURLY_RATE_CENTS = 10_000; // $100.00, in person

/** Flat fee for a waitlister who held the full window and was never called in. */
export const WAITLIST_WAIT_FEE_CENTS = 1_000; // $10.00

/** How long a waitlister is asked to hold before the flat fee applies. */
export const WAITLIST_HOLD_MINUTES = 15;

/** Used when a session row predates `waitlist_cap`. */
export const DEFAULT_WAITLIST_CAP = 2;

export type WaitlistOutcome = "called_in" | "waited_out";

/** What a participant earns per hour of session, by how the session is run. */
export function hourlyRateCents(deliveryMode?: DeliveryMode | string | null): number {
  return isOffline(deliveryMode) ? OFFLINE_HOURLY_RATE_CENTS : HOURLY_RATE_CENTS;
}

/**
 * How many reserve slots a session offers. Always zero in person: see the note
 * at the top. `storedCap` is `sessions.waitlist_cap`, which stays whatever it
 * was — the mode decides, not the column, so a session that flips mode (it
 * cannot, but still) can never strand people in slots that no longer exist.
 */
export function waitlistCapFor(
  deliveryMode: DeliveryMode | string | null | undefined,
  storedCap?: number | null,
): number {
  if (isOffline(deliveryMode)) return 0;
  return storedCap ?? DEFAULT_WAITLIST_CAP;
}

/** True when the waitlist concept does not apply to this session at all. */
export function supportsWaitlist(deliveryMode?: DeliveryMode | string | null): boolean {
  return !isOffline(deliveryMode);
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

/**
 * Payout for a recorded waitlist outcome. Only reachable for online sessions —
 * an in-person session never creates a waitlisted row — so the flat waiting fee
 * has no in-person counterpart to diverge from.
 */
export function waitlistPayoutCents(
  outcome: WaitlistOutcome,
  hours: number,
  deliveryMode?: DeliveryMode | string | null,
): number {
  return outcome === "called_in"
    ? seatPayoutCents(hours, deliveryMode)
    : WAITLIST_WAIT_FEE_CENTS;
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
