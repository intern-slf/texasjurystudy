"use client";

import { utcTimeToLocal } from "@/lib/timezone";

interface Props {
  sessionDate: string;
  startUtc: string;
  endUtc: string;
}

export default function LocalTimeRange({ sessionDate, startUtc, endUtc }: Props) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = utcTimeToLocal(sessionDate, startUtc, tz);
  const end   = utcTimeToLocal(sessionDate, endUtc,   tz);
  return <span className="text-slate-500">{start} → {end}</span>;
}
