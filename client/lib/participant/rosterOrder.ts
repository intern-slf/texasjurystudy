/* =========================
   ROSTER ORDER

   Every participant list in the app reads in the same order: the people who are
   coming, then the people who said no, then the people who haven't answered,
   then the people who accepted and were struck. Alphabetical by the name as
   rendered ("First Last") inside each group.

   Waitlisted people sit in their own group directly after accepted: they are
   the reserve, not a seat, so they are never counted inside "Accepted: n/cap".

   Kept in one place because five screens render the same roster from five
   different row shapes — they agree only if they share this comparator.
========================= */

import { WAITLISTED_STATUS } from "@/lib/participant/waitlist";

export type RosterGroup = "accepted" | "waitlisted" | "declined" | "pending" | "struck";

/** Display order; the index doubles as the sort rank. */
export const ROSTER_GROUP_ORDER: readonly RosterGroup[] = [
  "accepted",
  "waitlisted",
  "declined",
  "pending",
  "struck",
];

export type RosterEntry = {
  /** Name exactly as rendered — the within-group sort is lexicographic on this. */
  name: string;
  /** Raw `session_participants.invite_status`. */
  inviteStatus?: string | null;
  /** `session_participants.struck_at` is set for this session. */
  struck?: boolean;
};

/**
 * A strike outranks the status it was applied to: they accepted and then backed
 * out or never showed, so they don't belong among the people who are coming.
 * Anything unrecognised — including null — reads as pending, matching
 * `InviteStatusBadge`. "rejected" is the legacy spelling of declined.
 */
export function rosterGroup(inviteStatus?: string | null, struck?: boolean): RosterGroup {
  if (struck) return "struck";
  if (inviteStatus === "accepted") return "accepted";
  if (inviteStatus === WAITLISTED_STATUS) return "waitlisted";
  if (inviteStatus === "declined" || inviteStatus === "rejected") return "declined";
  return "pending";
}

export function rosterRank(entry: RosterEntry): number {
  return ROSTER_GROUP_ORDER.indexOf(rosterGroup(entry.inviteStatus, entry.struck));
}

export function compareRosterEntries(a: RosterEntry, b: RosterEntry): number {
  const byGroup = rosterRank(a) - rosterRank(b);
  if (byGroup !== 0) return byGroup;
  return a.name.localeCompare(b.name);
}

/** Non-mutating sort of any row shape, via an accessor. */
export function sortRoster<T>(items: readonly T[], read: (item: T) => RosterEntry): T[] {
  return [...items].sort((a, b) => compareRosterEntries(read(a), read(b)));
}

/** Status text for the lists that render a plain label rather than a badge. */
export function rosterStatusLabel(inviteStatus?: string | null, struck?: boolean): string {
  switch (rosterGroup(inviteStatus, struck)) {
    case "accepted":
      return "Accepted";
    case "waitlisted":
      return "Waitlisted";
    case "declined":
      return "Declined";
    case "struck":
      return "Struck";
    default:
      return "Pending";
  }
}
