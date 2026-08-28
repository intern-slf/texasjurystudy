/* =========================
   IN-PERSON CATCHMENT

   The counties an in-person session may draw participants from. This is a
   travel radius around the venue, not a property of anyone's case — so it
   REPLACES the case's own county for offline candidate selection rather than
   narrowing it. A case pending in Dallas that is run in person still draws from
   the counties below, because that is who can physically reach the room.

   Two consequences worth knowing before changing anything here:

   1. It is a HARD constraint, applied alongside the blacklist and cooldown
      exclusions rather than through `filters.location`. Location is
      FILTER_PRIORITY[0] — the first filter `relaxFilters` drops — and relaxing a
      travel radius produces candidates who can only decline. See
      `applyOfflineCatchment`.

   2. Panel depth is the real limit, not the rule. As of 2026-08-26 these six
      counties hold roughly 83 participants, of whom about 12 are active
      (`reactivation_status = 'yes'`), against 10 seats plus reserves per
      session. Almost all of that is Harris. Widening the radius, or reactivating
      people in these counties, is what makes in-person sessions staffable —
      loosening the filter would not.

   Stored county values carry a " County" suffix ("Harris County") while this
   list and TEXAS_COUNTIES do not. Compare through `countyMatches` in
   filter-utils, never with a bare equality.
========================= */

export const OFFLINE_CATCHMENT_COUNTIES = [
  "Montgomery",
  "Walker",
  "San Jacinto",
  "Grimes",
  "Harris",
  "Houston",
] as const;

/** Rendered to requestees under the In-Person option: "Montgomery, Walker, … and Houston". */
export function catchmentSentence(): string {
  const names = OFFLINE_CATCHMENT_COUNTIES.map((c) => `${c} County`);
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
