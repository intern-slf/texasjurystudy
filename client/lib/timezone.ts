/** Convert local date+time to a UTC time string "HH:MM:SS" (for storing in a time column). */
export function localToUTCTime(dateStr: string, timeStr: string, ianaTimezone: string): string {
  return localToUTC(dateStr, timeStr, ianaTimezone).split("T")[1].slice(0, 8);
}

/** Convert a UTC time string "HH:MM" stored in the DB back to local "HH:MM" for display. */
export function utcTimeToLocal(sessionDate: string, utcTimeStr: string, ianaTimezone: string): string {
  const utcDt = new Date(`${sessionDate}T${utcTimeStr.slice(0, 5)}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcDt);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export function localToUTC(dateStr: string, timeStr: string, ianaTimezone: string): string {
  // Parse the date+time as if it were UTC (server runs in UTC)
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`);

  // Format that UTC instant in the target timezone to find the local offset
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(asUTC);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const inTz = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`
  );

  // diffMs is the UTC offset for this timezone at this exact moment (handles DST)
  const diffMs = asUTC.getTime() - inTz.getTime();
  return new Date(asUTC.getTime() + diffMs).toISOString();
}
