/**
 * Badge for a `session_participants.invite_status`. On a past session an
 * unanswered invite reads as "No response" (the signal behind the strike
 * system); on an upcoming one it's still just "Pending".
 *
 * A strike for that session outranks the invite status: someone who accepted and
 * then backed out reads "Striked", not "Confirmed"/"Attended".
 */
export default function InviteStatusBadge({
  status,
  isPast = false,
  struck = false,
}: {
  status: string;
  isPast?: boolean;
  /** `session_participants.struck_at` is set for this session. */
  struck?: boolean;
}) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset";

  if (struck) {
    return (
      <span
        className={`${base} bg-orange-400/10 text-orange-600 ring-orange-400/30`}
        title="Struck for not attending / backing out of this session."
      >
        Striked
      </span>
    );
  }

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
