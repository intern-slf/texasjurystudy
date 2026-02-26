"use client";

export default function TimezoneInput() {
  return (
    <input
      type="hidden"
      name="tz"
      value={Intl.DateTimeFormat().resolvedOptions().timeZone}
    />
  );
}
