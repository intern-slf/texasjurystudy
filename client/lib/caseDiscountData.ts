import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBookingsForCases } from "@/lib/slotBookingData";
import type { CaseDiscount } from "@/lib/promoCode";

/**
 * Reads a case's discount (public.case_discounts, 20261027_promo_codes.sql)
 * with the service role. Not a server action, so nothing here can be called
 * from a browser. The service role sees every firm's cases, so the caller
 * checks first that the reader is an admin or owns the case.
 */

export type CaseDiscountState = {
  discount: CaseDiscount | null;
  /** The case's booking is marked paid, so the discount can't change. */
  paid: boolean;
};

type DiscountRow = {
  percent_off: number;
  applied_by_admin: boolean;
  applied_at: string;
  promo_codes?: { code?: string | null } | { code?: string | null }[] | null;
};

/** The case's discount, or null for none. Throws when the read fails. */
export async function getCaseDiscount(caseId: string): Promise<CaseDiscount | null> {
  const { data, error } = await supabaseAdmin
    .from("case_discounts")
    .select("percent_off, applied_by_admin, applied_at, promo_codes (code)")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the case's discount: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as DiscountRow;
  const code = Array.isArray(row.promo_codes) ? row.promo_codes[0] : row.promo_codes;
  return {
    percentOff: row.percent_off,
    code: code?.code ?? null,
    appliedByAdmin: row.applied_by_admin,
    appliedAt: row.applied_at,
  };
}

/** The case's discount and whether it is paid, for the case pages. Throws when a read fails. */
export async function getCaseDiscountState(caseId: string): Promise<CaseDiscountState> {
  const [discount, bookings] = await Promise.all([getCaseDiscount(caseId), getBookingsForCases([caseId])]);
  return { discount, paid: !!bookings.get(caseId)?.paid_at };
}
