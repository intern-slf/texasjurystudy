/**
 * Today's date in Central Time, "YYYY-MM-DD": the calendar sessions.session_date
 * is on, so a session date can be compared with it as text.
 *
 * Not the server's date: the server runs in UTC, whose date turns over at
 * 7 PM CDT / 6 PM CST. Comparing session dates with it put each day's evening
 * sessions in the past while they were starting: My Sessions said "Completed"
 * and hid the Zoom link and address, and the admin lists moved them to Past.
 */
export function centralToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
