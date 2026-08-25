import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_DELIVERY_MODE,
  sessionDeliveryMode,
  type DeliveryMode,
} from "@/lib/case/deliveryMode";

/* =========================
   A SESSION'S DELIVERY MODE

   Sessions do not carry their own online/offline flag — the mode belongs to the
   cases, and every case in a session must share one (enforced in
   addCasesToSession / replaceCaseInSession and by the
   session_cases_single_delivery_mode trigger). This is the one read that turns
   that invariant into an answer.

   It matters at three points, and getting it wrong is expensive at all three:
     - what participants are paid  ($30/hr online vs $40/hr in person)
     - the waitlist's terms        (15 min/$10 online vs 30 min/$30 in person)
     - what an admin sends them    (a Zoom link vs an address)

   Server-only: pulls in the service-role client. Import the pure helpers from
   lib/case/deliveryMode anywhere a client component is involved.
========================= */

/** Every case mode attached to a session, in no particular order. */
async function readCaseModes(sessionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("session_cases")
    .select("cases(delivery_mode)")
    .eq("session_id", sessionId);

  type Row = { cases?: { delivery_mode?: string | null } | { delivery_mode?: string | null }[] | null };

  return ((data ?? []) as Row[])
    .map((row) => {
      const c = Array.isArray(row.cases) ? row.cases[0] : row.cases;
      return c?.delivery_mode ?? null;
    })
    .filter((m): m is string => m !== null);
}

/**
 * The mode of a session, or `null` when it has no cases attached yet — at which
 * point there is genuinely nothing to answer, and the caller decides whether
 * that means "treat as online" or "refuse".
 *
 * Throws if the session's cases disagree. That state is blocked at every write
 * path, so it means something is broken; guessing would pay someone the wrong
 * rate.
 */
export async function getSessionDeliveryMode(
  sessionId: string,
): Promise<DeliveryMode | null> {
  return sessionDeliveryMode(await readCaseModes(sessionId));
}

/**
 * Same lookup for callers that must produce a value no matter what — a payout
 * write, an email send. An empty session falls back to 'online', the historical
 * and cheaper behaviour.
 */
export async function getSessionDeliveryModeOrDefault(
  sessionId: string,
): Promise<DeliveryMode> {
  return (await getSessionDeliveryMode(sessionId)) ?? DEFAULT_DELIVERY_MODE;
}
