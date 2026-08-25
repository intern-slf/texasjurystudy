/* =========================
   DELIVERY MODE — online vs in-person

   A case is either run over Zoom ('online') or in a physical room ('offline').
   The choice is made by the requestee when the case is created, and it drives
   three separate things:

     price       $850/hr  vs $1,500/hr to the requestee (see receipt-pricing)
     payout      $30/hr   vs $40/hr to participants      (see participant/waitlist)
     waitlist    both have one, on different terms       (see participant/waitlist)
     joining     a Zoom link (sessions.zoom_link) vs an address (sessions.location)

   A session may not mix the two. There is one venue and one payout rate per
   session, so a mixed session has no coherent answer for either. The rule is
   enforced in the app (addCasesToSession / replaceCaseInSession) and again by a
   trigger in the database, since cases are routinely attached by hand from the
   SQL editor.

   A session does not store its own mode — it is derived from the cases attached
   to it, which the no-mixing rule keeps single-valued. `sessionDeliveryMode`
   below is that derivation, and it is the only place it should happen.

   Pure module, no imports: it is pulled into client components (the receipt
   preview) as well as server actions.
========================= */

export const DELIVERY_MODES = ["online", "offline"] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** What every case row created before this feature is, and the column default. */
export const DEFAULT_DELIVERY_MODE: DeliveryMode = "online";

/**
 * Anything unrecognised reads as 'online'. The column has a CHECK constraint and
 * a NOT NULL default, so a bad value should be impossible — but a stale row
 * shape or a hand-run UPDATE must degrade to the cheaper, safer regime rather
 * than quietly billing someone the in-person rate.
 */
export function normalizeDeliveryMode(value: unknown): DeliveryMode {
  return value === "offline" ? "offline" : DEFAULT_DELIVERY_MODE;
}

export function isOffline(value: unknown): boolean {
  return normalizeDeliveryMode(value) === "offline";
}

/** Title-case name for UI and email copy. */
export function deliveryModeLabel(value: unknown): string {
  return isOffline(value) ? "In-Person" : "Online";
}

/** Lower-case name for mid-sentence use ("this in-person session"). */
export function deliveryModeAdjective(value: unknown): string {
  return isOffline(value) ? "in-person" : "online";
}

/** What an admin sends participants so they can attend. */
export function joinDetailLabel(value: unknown): string {
  return isOffline(value) ? "Location" : "Zoom Link";
}

/**
 * The single mode shared by a session's cases, or `null` when the session has no
 * cases yet and therefore no mode. Throws if the cases disagree: that state is
 * blocked at every write path and by a database trigger, so reaching it means
 * something is genuinely broken and must not be papered over with a guess — the
 * two branches pay participants 3.3× different amounts.
 */
export function sessionDeliveryMode(
  caseModes: readonly (string | null | undefined)[],
): DeliveryMode | null {
  if (!caseModes.length) return null;

  const modes = new Set(caseModes.map(normalizeDeliveryMode));
  if (modes.size > 1) {
    throw new Error(
      "This session contains both online and in-person cases, which is not a valid " +
        "combination — they have different venues and different participant pay rates. " +
        "Remove one of them from the session before continuing.",
    );
  }

  return [...modes][0];
}

/**
 * Same derivation, but never throws — for read-only surfaces (a list badge, a
 * roster header) where a broken session should still render. Falls back to
 * 'online', matching `normalizeDeliveryMode`.
 */
export function sessionDeliveryModeOrDefault(
  caseModes: readonly (string | null | undefined)[],
): DeliveryMode {
  if (!caseModes.length) return DEFAULT_DELIVERY_MODE;
  return caseModes.some(isOffline) ? "offline" : DEFAULT_DELIVERY_MODE;
}

/**
 * Guard for the write paths that attach cases to a session. `incoming` are the
 * cases being added, `existing` the ones already there. Throws a message meant
 * to be shown to an admin.
 */
export function assertCasesShareDeliveryMode(
  incoming: readonly (string | null | undefined)[],
  existing: readonly (string | null | undefined)[] = [],
): DeliveryMode | null {
  const all = [...incoming, ...existing];
  if (!all.length) return null;

  const hasOffline = all.some(isOffline);
  const hasOnline = all.some((m) => !isOffline(m));

  if (hasOffline && hasOnline) {
    throw new Error(
      "A session cannot hold both in-person and online cases. In-person cases need a " +
        "room and pay participants $40/hr; online cases need a Zoom link and pay $30/hr. " +
        "Build a separate session for each.",
    );
  }

  return hasOffline ? "offline" : DEFAULT_DELIVERY_MODE;
}
