import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRequestee } from "@/lib/requireRequestee";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { describeSlot, type TimeSlot } from "@/lib/requesteeTimeSlots";
import { earliestBookableStart, formatDeadline, paymentDueAt } from "@/lib/slotBooking";
import { getBookingsForCases, getOpenSlots } from "@/lib/slotBookingData";
import CaseTimeSlotControls from "@/components/CaseTimeSlotControls";

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

/**
 * "Focus group time" on the firm's case page: the slot the case holds and where
 * payment stands, and, while the case is under review, controls to hold, switch
 * or give up a time.
 *
 * Reads the booking with the service role, so it checks for itself that the
 * caller is a firm (by public.roles) and that the case is theirs.
 */
export default async function CaseTimeSlotCard({ caseId }: { caseId: string }) {
  let userId: string;
  try {
    userId = await requireRequestee();
  } catch {
    return null;
  }

  const { data: theCase } = await supabaseAdmin
    .from("cases")
    .select("user_id, requestee_id, admin_status, status, deleted_at, delivery_mode, hours_requested")
    .eq("id", caseId)
    .maybeSingle();
  if (!theCase || (theCase.user_id !== userId && theCase.requestee_id !== userId)) return null;

  const nowMs = Date.now();
  const offline = theCase.delivery_mode === "offline";
  const underReview = theCase.admin_status === "all" && theCase.status === "current" && !theCase.deleted_at;
  const canChange = !offline && underReview;

  let record;
  try {
    record = (await getBookingsForCases([caseId])).get(caseId);
  } catch (err) {
    // Most likely the booking tables don't exist yet; the rest of the page works.
    console.error("[CaseTimeSlotCard] couldn't read the booking:", err);
    return null;
  }

  // The open times are only for the controls. If they can't be read, the firm
  // still sees the time it holds and its payment deadline.
  let openSlots: TimeSlot[] | null = [];
  if (canChange) {
    try {
      openSlots = await getOpenSlots(
        earliestBookableStart(nowMs).toISOString(),
        new Date(nowMs + SIX_MONTHS_MS).toISOString()
      );
    } catch (err) {
      console.error("[CaseTimeSlotCard] couldn't read the open times:", err);
      openSlots = null;
    }
  }
  const slot = record?.slot ?? null;
  const due = record?.held_since && !record.paid_at ? paymentDueAt(record.held_since) : null;

  // Nothing to show: no time held, and nothing the firm can do about it here.
  if (!slot && !underReview) return null;

  const contact = (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );

  return (
    <section className="bg-white border rounded-xl p-6 space-y-3">
      <h2 className="text-base font-semibold">Focus group time</h2>

      {slot ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">{describeSlot(slot)}</p>
          <p className="text-sm text-muted-foreground">
            {record?.paid_at
              ? "Payment received. Thank you."
              : due && nowMs >= due.getTime()
                ? `Payment was due ${formatDeadline(due)}. If we haven't received it, we may release this time.`
                : due
                  ? `Payment is due by ${formatDeadline(due)}. An invoice will follow from our team.`
                  : null}
          </p>
        </div>
      ) : offline ? (
        <p className="text-sm text-muted-foreground">
          For an in-person focus group, email us at {contact} to arrange a time.
        </p>
      ) : openSlots ? (
        <p className="text-sm text-muted-foreground">
          Pick one of our open times below and we&apos;ll hold it while we review your case.
        </p>
      ) : null}

      {canChange && openSlots ? (
        <CaseTimeSlotControls
          caseId={caseId}
          hasSlot={!!slot}
          paid={!!record?.paid_at}
          openSlots={openSlots}
          hoursRequested={theCase.hours_requested}
        />
      ) : canChange ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load our open times. Reload the page to pick or change a time.
        </p>
      ) : (
        slot && (
          <p className="text-sm text-muted-foreground">To change this time, email us at {contact}.</p>
        )
      )}
    </section>
  );
}
