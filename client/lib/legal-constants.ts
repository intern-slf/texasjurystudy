/**
 * Shared values for the public legal pages: /privacy, /terms and /contact.
 *
 * ---------------------------------------------------------------------------
 * BEFORE PUBLISHING, the firm needs to confirm or replace:
 *
 *   1. LEGAL_ENTITY    The registered entity that actually operates Texas Jury
 *                      Study. Right now this is the product name, not a legal
 *                      entity, which is fine for a soft launch but should be
 *                      the real entity before real money changes hands.
 *
 *   2. MAILING_ADDRESS A postal address belongs in a complete privacy notice.
 *                      While this is null every page hides the address block
 *                      entirely, so nothing renders as "null".
 *
 *   3. EFFECTIVE_DATE  Set both to the date the firm signs off on the wording.
 *      LAST_UPDATED    Update LAST_UPDATED on every substantive edit.
 * ---------------------------------------------------------------------------
 */

export const LEGAL_ENTITY = "Texas Jury Study";

export const SUPPORT_EMAIL = "info@texasjurystudy.com";

/** Set to the firm's postal address to reveal the address block on the legal pages. */
export const MAILING_ADDRESS: string | null = null;

/** ISO yyyy-mm-dd. */
export const EFFECTIVE_DATE = "2026-07-28";

/** ISO yyyy-mm-dd. */
export const LAST_UPDATED = "2026-08-18";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Renders an ISO `yyyy-mm-dd` string as e.g. "July 27, 2026".
 *
 * Deliberately parses the string by hand rather than going through `Date` and
 * `toLocaleDateString`: those resolve against the runtime's timezone and locale,
 * so the server and the browser can disagree and trip a hydration mismatch.
 * Footer-temp.tsx already works around one of those.
 */
export function formatLegalDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return iso;

  return `${monthName} ${Number(day)}, ${year}`;
}
