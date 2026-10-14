import { centralToday } from "@/lib/centralToday";
import { CENTRAL_TIME_ZONE, localToUTC } from "@/lib/timezone";

/** How far ahead each "Session Completion Timeframe" answer puts the case's deadline. */
const TIMEFRAME_TO_DAYS = new Map<string, number>([
  ["Within a Week", 7],
  ["Within 2 Weeks", 14],
  ["Within a Month", 30],
  ["Within 3 Months", 90],
]);

/**
 * A case's deadline for its timeframe answer: 11:59 PM Central Time that many
 * days after today in Central Time, as an ISO instant. Null for any other answer.
 *
 * Both forms used to build it on their own clock: the edit form's server action
 * on UTC, so it was 11:59 PM UTC (6:59 PM CDT), and the new-case form in the
 * firm's browser, so outside Texas it was 11:59 PM in the firm's own zone. Read
 * on the Central calendar, those deadlines could land on the next day.
 */
export function deadlineForTimeframe(
  timeframe: string | null | undefined,
  now: Date = new Date()
): string | null {
  const days = TIMEFRAME_TO_DAYS.get(timeframe ?? "");
  if (!days) return null;
  const date = new Date(Date.parse(`${centralToday(now)}T00:00:00Z`) + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return localToUTC(date, "23:59", CENTRAL_TIME_ZONE);
}
