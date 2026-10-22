import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBookingsForCases } from "@/lib/slotBookingData";
import { caseSessionTime, type CaseSessionRow } from "@/lib/case/caseSessionTime";
import { buildInvoice, type InvoiceCase, type InvoiceView } from "@/lib/invoice";

/**
 * Reads what a case's invoice needs with the service role: the case, the time
 * its firm holds and whether it's paid, and the firm's name and email. Not a
 * server action, so nothing here can be called from a browser. The service role
 * sees every firm's cases, so the caller checks first that the reader is an
 * admin or owns the case (`ownerIds`).
 */

export type InvoiceData = {
  invoice: InvoiceView;
  /** Who may see it besides an admin: the case's creator and its requestee. */
  ownerIds: string[];
};

type CaseRow = InvoiceCase & {
  user_id: string;
  requestee_id: string | null;
  session_cases: CaseSessionRow[] | null;
};

const CASE_COLUMNS =
  "id, title, filters, hours_requested, delivery_mode, approved_at, created_at, user_id, requestee_id, " +
  "session_cases (start_time, end_time, sessions (session_date))";

/** The case's invoice, or null when there is no such case. Throws when a read fails. */
export async function getInvoiceData(caseId: string, nowMs: number): Promise<InvoiceData | null> {
  const { data, error } = await supabaseAdmin.from("cases").select(CASE_COLUMNS).eq("id", caseId).maybeSingle();
  if (error) throw new Error(`Couldn't read the case: ${error.message}`);
  if (!data) return null;
  const theCase = data as unknown as CaseRow;

  // The firm the case belongs to: requestee_id when set, else the creator.
  const firmId = theCase.requestee_id || theCase.user_id;
  const [bookings, { data: agreement }, { data: role }] = await Promise.all([
    getBookingsForCases([caseId]),
    supabaseAdmin
      .from("confidentiality_agreements_requestee")
      .select("first_name, last_name")
      .eq("user_id", firmId)
      .maybeSingle(),
    supabaseAdmin.from("roles").select("email").eq("user_id", firmId).maybeSingle(),
  ]);
  const record = bookings.get(caseId) ?? null;

  return {
    invoice: buildInvoice({
      theCase,
      booking: record,
      slot: record?.slot ?? null,
      sessionTime: caseSessionTime(theCase.session_cases),
      firm: {
        name: agreement ? `${agreement.first_name ?? ""} ${agreement.last_name ?? ""}`.trim() || null : null,
        email: (role?.email as string | null) ?? null,
      },
      nowMs,
    }),
    ownerIds: [theCase.user_id, theCase.requestee_id].filter((id): id is string => !!id),
  };
}
