import { formatSessionSpan } from "@/lib/timezone";

interface Props {
  sessionDate: string;
  startUtc: string;
  endUtc: string;
}

/**
 * A case's stored UTC times as "10:00 AM – 11:00 AM CT", on its session's date.
 * Central Time, as participants and firms are told: in the viewer's own zone, an
 * admin outside Texas saw clock times that didn't match the emails, beside a
 * Central date they could fall a day off from.
 */
export default function CentralTimeRange({ sessionDate, startUtc, endUtc }: Props) {
  const span = formatSessionSpan(sessionDate, [startUtc], [endUtc]);
  return <span className="text-slate-500">{span ? `${span} CT` : "Time unreadable"}</span>;
}
