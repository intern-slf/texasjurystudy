"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRequestee } from "@/lib/requireRequestee";
import { syncInvoiceQuietly } from "@/lib/invoiceData";
import { PAID_MESSAGE, firmPromoMessage, isValidPromoCode, normalizePromoCode } from "@/lib/promoCode";

// A law firm's own promo code actions. Every export starts with
// requireRequestee(): as server actions they can be called by anyone signed in,
// with any arguments.
//
// Firms have no access to the promo code tables, so these go through the
// database functions of 20261027_promo_codes.sql with the service role, after
// checking the case is the caller's own (user_id or requestee_id). A case that
// isn't the caller's gets the same answer as one that doesn't exist. The
// functions refuse any change once the case is paid, and hold every code to
// its limits for the case's firm.
//
// A firm may replace or remove any discount on its unpaid case, an admin's
// included.
//
// Problems the firm can act on come back as { ok: false, error }, because Next
// hides a thrown message in production.

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const NO_CASE = "That case doesn't exist.";

/** The firm the case belongs to (requestee_id, else its creator), if the caller is it. */
async function ownCaseFirm(caseId: string, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("cases")
    .select("id, user_id, requestee_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!data || (data.user_id !== userId && data.requestee_id !== userId)) return null;
  return (data.requestee_id as string | null) || (data.user_id as string);
}

function revalidateCase(caseId: string) {
  revalidatePath("/dashboard/requestee");
  revalidatePath(`/dashboard/requestee/${caseId}`);
  revalidatePath(`/dashboard/Admin/${caseId}`);
  revalidatePath(`/invoice/${caseId}`);
}

/* =========================
   CHECK A CODE
   For the new-case form, before the case exists: what the code would take off.
   Nothing is saved, and the code isn't held; applyPromoCode checks it again.
========================= */

export async function checkPromoCode(code: string): Promise<{ ok: true; code: string; percentOff: number } | Failure> {
  const userId = await requireRequestee();
  const normalized = normalizePromoCode(code);
  if (!isValidPromoCode(normalized)) return fail(firmPromoMessage("not_found"));

  const { data, error } = await supabaseAdmin
    .rpc("check_promo_code", { p_code: normalized, p_firm_id: userId })
    .maybeSingle();
  if (error) {
    console.error("[checkPromoCode] check failed:", error);
    return fail("Couldn't check that promo code. Try again.");
  }
  const result = data as { outcome: string; percent_off: number | null } | null;
  if (result?.outcome !== "ok" || !result.percent_off) return fail(firmPromoMessage(result?.outcome));
  return { ok: true, code: normalized, percentOff: result.percent_off };
}

/* =========================
   APPLY, OR SWITCH TO, A CODE
========================= */

export async function applyPromoCode(
  caseId: string,
  code: string
): Promise<{ ok: true; percentOff: number } | Failure> {
  const userId = await requireRequestee();
  if (!isUuid(caseId)) return fail(NO_CASE);
  const firmId = await ownCaseFirm(caseId, userId);
  if (!firmId) return fail(NO_CASE);

  const normalized = normalizePromoCode(code);
  if (!isValidPromoCode(normalized)) return fail(firmPromoMessage("not_found"));

  const { data, error } = await supabaseAdmin
    .rpc("apply_promo_code", {
      p_case_id: caseId,
      p_code: normalized,
      p_firm_id: firmId,
      p_applied_by: userId,
      p_by_admin: false,
    })
    .maybeSingle();
  if (error) {
    console.error("[applyPromoCode] apply failed:", error);
    return fail("Couldn't apply that promo code. Try again.");
  }
  const result = data as { outcome: string; percent_off: number | null } | null;
  if (result?.outcome !== "applied" || !result.percent_off) return fail(firmPromoMessage(result?.outcome));

  await syncInvoiceQuietly(caseId);
  revalidateCase(caseId);
  return { ok: true, percentOff: result.percent_off };
}

/* =========================
   REMOVE THE DISCOUNT
========================= */

export async function removePromoCode(caseId: string): Promise<{ ok: true } | Failure> {
  const userId = await requireRequestee();
  if (!isUuid(caseId)) return fail(NO_CASE);
  if (!(await ownCaseFirm(caseId, userId))) return fail(NO_CASE);

  const { data, error } = await supabaseAdmin.rpc("remove_case_discount", { p_case_id: caseId });
  if (error) {
    console.error("[removePromoCode] remove failed:", error);
    return fail("Couldn't remove the discount. Try again.");
  }
  if (data === "paid") return fail(PAID_MESSAGE);

  await syncInvoiceQuietly(caseId);
  revalidateCase(caseId);
  return { ok: true };
}
