/**
 * Badge for a `session_participants.invite_status`. On a past session an
 * unanswered invite reads as "No response" (the signal behind the strike
 * system); on an upcoming one it's still just "Pending".
 */
export default function InviteStatusBadge({
  status,
  isPast = false,
}: {
  status: string;
  isPast?: boolean;
}) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset";

  if (status === "accepted") {
    return (
      <span className={`${base} bg-green-400/10 text-green-600 ring-green-400/20`}>
        {isPast ? "Attended" : "Confirmed"}
      </span>
    );
  }

  if (status === "declined") {
    return (
      <span className={`${base} bg-amber-400/10 text-amber-700 ring-amber-400/30`}>
        Declined
      </span>
    );
  }

  return (
    <span
      className={
        isPast
          ? `${base} bg-red-400/10 text-red-600 ring-red-400/20`
          : `${base} bg-slate-400/10 text-slate-600 ring-slate-400/20`
      }
    >
      {isPast ? "No response" : "Pending"}
    </span>
  );
}
