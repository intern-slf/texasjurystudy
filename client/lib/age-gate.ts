/**
 * Minimum age for every account, participant and requestee alike. The Terms
 * (§2) and Privacy Policy (§12) promise 18+, and Texas jurors must be 18
 * (Gov't Code §62.102). Letting a younger date of birth through means we'd be
 * storing a minor's data with actual knowledge of their age — the thing COPPA
 * (under 13) penalises per violation.
 */
export const MINIMUM_AGE = 18;

export const UNDERAGE_MESSAGE = `Texas Jury Study is only open to people ${MINIMUM_AGE} and older.`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whole years between a "YYYY-MM-DD" birth date and `today`, or null when the
 * string isn't a real calendar date (e.g. "2000-02-30").
 */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const match = ISO_DATE.exec(dateOfBirth);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Date.UTC rolls invalid days into the next month; a mismatch means the input was bogus.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--;
  return age;
}

/** A user-facing reason to reject this date of birth, or null if it's acceptable. */
export function dateOfBirthError(
  dateOfBirth: string | null | undefined,
  today: Date = new Date()
): string | null {
  if (!dateOfBirth) return "Please enter your date of birth.";

  const age = ageOn(dateOfBirth, today);
  if (age === null || age < 0 || age > 120) return "Please enter a valid date of birth.";
  if (age < MINIMUM_AGE) return UNDERAGE_MESSAGE;
  return null;
}

/** Today as "YYYY-MM-DD" in local time, for a date input's `max`. */
export function todayIso(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
