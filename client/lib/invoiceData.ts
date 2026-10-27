import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBookingsForCases } from "@/lib/slotBookingData";
import { getCaseDiscount } from "@/lib/caseDiscountData";
import { caseSessionTime, type CaseSessionRow } from "@/lib/case/caseSessionTime";
import {
  invoiceContent,
  invoiceView,
  issuedAtFor,
  planInvoice,
  type InvoiceCase,
  type InvoiceRecord,
  type InvoiceView,
} from "@/lib/invoice";

/**
 * Keeps a case's invoice in public.invoices (20261023_invoices.sql) and reads
 * it, with the service role. Not a server action, so nothing here can be called
 * from a browser. The service role sees every firm's cases, so the caller
 * checks first that the reader is an admin or owns the case (`ownerIds`).
 */

export type InvoiceData = {
  /** Null while the case isn't billed yet: not approved, and no time held. */
  invoice: InvoiceView | null;
  /** Who may see it besides an admin: the case's creator and its requestee. */
  ownerIds: string[];
};

type CaseRow = InvoiceCase & {
  user_id: string;
  requestee_id: string | null;
  session_cases: CaseSessionRow[] | null;
};

const CASE_COLUMNS =
  "id, title, filters, hours_requested, delivery_mode, admin_status, deleted_at, approved_at, user_id, requestee_id, " +
  "session_cases (start_time, end_time, sessions (session_date))";

const INVOICE_COLUMNS =
  "id, invoice_number, case_id, issued_at, billed_to_name, billed_to_email, case_title, delivery_mode, lines, " +
  "total_cents, revised_at, voided_at";

/**
 * Brings the case's invoice up to date (issues, revises or voids it, as
 * planInvoice says) and returns it with where payment stands. Null when there
 * is no such case. Throws when a read or write fails.
 */
export async function syncInvoice(caseId: string, nowMs: number = Date.now()): Promise<InvoiceData | null> {
  const { data, error } = await supabaseAdmin.from("cases").select(CASE_COLUMNS).eq("id", caseId).maybeSingle();
  if (error) throw new Error(`Couldn't read the case: ${error.message}`);
  if (!data) return null;
  const theCase = data as unknown as CaseRow;

  // The firm the case belongs to: requestee_id when set, else the creator.
  const firmId = theCase.requestee_id || theCase.user_id;
  // A discount that can't be read throws, rather than revising the invoice without it.
  const [bookings, discount, { data: agreement }, { data: role }, { data: stored, error: invoiceError }] = await Promise.all([
    getBookingsForCases([caseId]),
    getCaseDiscount(caseId),
    supabaseAdmin
      .from("confidentiality_agreements_requestee")
      .select("first_name, last_name")
      .eq("user_id", firmId)
      .maybeSingle(),
    supabaseAdmin.from("roles").select("email").eq("user_id", firmId).maybeSingle(),
    supabaseAdmin.from("invoices").select(INVOICE_COLUMNS).eq("case_id", caseId).maybeSingle(),
  ]);
  if (invoiceError) throw new Error(`Couldn't read the invoice: ${invoiceError.message}`);

  const booking = bookings.get(caseId) ?? null;
  const slot = booking?.slot ?? null;
  const content = invoiceContent({
    theCase,
    slot,
    sessionTime: caseSessionTime(theCase.session_cases),
    firm: {
      name: agreement ? `${agreement.first_name ?? ""} ${agreement.last_name ?? ""}`.trim() || null : null,
      email: (role?.email as string | null) ?? null,
    },
    discountPercent: discount?.percentOff ?? null,
  });

  let record = (stored as InvoiceRecord | null) ?? null;
  const nowIso = new Date(nowMs).toISOString();

  switch (planInvoice({ record, content, theCase, booking })) {
    case "issue": {
      const { data: issued, error: issueError } = await supabaseAdmin
        .rpc("issue_invoice", {
          p_case_id: caseId,
          p_firm_id: firmId,
          p_issued_at: issuedAtFor(theCase, booking, nowMs),
          p_billed_to_name: content.billed_to_name,
          p_billed_to_email: content.billed_to_email,
          p_case_title: content.case_title,
          p_delivery_mode: content.delivery_mode,
          p_lines: content.lines,
          p_total_cents: content.total_cents,
        })
        .single();
      if (issueError) throw new Error(`Couldn't issue the invoice: ${issueError.message}`);
      record = issued as InvoiceRecord;
      break;
    }
    // A revision also clears voided_at: a voided invoice is only revised when its case is back.
    case "revise":
      record = await updateInvoice(record!.id, { ...content, revised_at: nowIso, voided_at: null });
      break;
    case "void":
      record = await updateInvoice(record!.id, { voided_at: nowIso });
      break;
  }

  return {
    invoice: record ? invoiceView({ record, booking, slot, nowMs }) : null,
    ownerIds: [theCase.user_id, theCase.requestee_id].filter((id): id is string => !!id),
  };
}

async function updateInvoice(id: string, changes: Partial<InvoiceRecord>): Promise<InvoiceRecord> {
  const { data, error } = await supabaseAdmin.from("invoices").update(changes).eq("id", id).select(INVOICE_COLUMNS).single();
  if (error) throw new Error(`Couldn't update the invoice: ${error.message}`);
  return data as unknown as InvoiceRecord;
}

/**
 * For the actions that bill a case (approving it, holding a time): issues or
 * updates its invoice then, so it's numbered in the order cases are billed. The
 * action has already done its job, so a failure is only logged; the invoice
 * page catches up the next time it's opened.
 */
export async function syncInvoiceQuietly(caseId: string): Promise<void> {
  try {
    await syncInvoice(caseId);
  } catch (err) {
    console.error("[syncInvoice] couldn't bring the invoice up to date:", err);
  }
}
