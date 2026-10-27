"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/requireAdmin";
import { syncInvoiceQuietly } from "@/lib/invoiceData";
import {
  PAID_MESSAGE,
  PROMO_CODES_PATH,
  adminPromoMessage,
  isValidPercentOff,
  isValidPromoCode,
  normalizePromoCode,
  parsePromoCodeInput,
  type PromoCodeInput,
} from "@/lib/promoCode";

// Every export here is an admin action and starts with requireAdmin(): as server
// actions they can be called by anyone signed in, with any arguments.
//
// Codes are written through the admin's own client, so the tables' admin-only
// RLS policies check each write again. A case's discount goes through the
// database functions of 20261027_promo_codes.sql, which only the service role
// may call: they refuse any change once the case is paid, and hold a code to
// its limits for the case's firm, whoever applies it. An admin's own
// percentage, without a code, has no limits.

type Result = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const NO_CODE = "That code doesn't exist. Refresh the page.";
const NO_CASE = "That case doesn't exist.";

/* =========================
   CODES
========================= */

/** Creates a code (`id` null) or saves changes to one. A case that already has the code keeps its percentage. */
export async function savePromoCode(id: string | null, input: PromoCodeInput): Promise<Result> {
  const adminId = await requireAdmin();
  if (id !== null && !isUuid(id)) return fail(NO_CODE);
  const parsed = parsePromoCodeInput(input);
  if (!parsed.ok) return parsed;
  const { firmIds, ...values } = parsed.values;

  // Every firm on the list has to be a firm: the list only offers firms, so
  // anything else came from somewhere else.
  if (firmIds.length) {
    const { data: firms, error } = await supabaseAdmin
      .from("roles")
      .select("user_id")
      .eq("role", "requestee")
      .in("user_id", firmIds);
    if (error) {
      console.error("[savePromoCode] firm check failed:", error);
      return fail("Couldn't save the code. Try again.");
    }
    if ((firms ?? []).length !== firmIds.length) {
      return fail("A firm on the list doesn't exist. Refresh the page and try again.");
    }
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  let codeId = id;
  if (codeId === null) {
    const { data, error } = await supabase
      .from("promo_codes")
      .insert({ ...values, created_by: adminId, updated_at: now })
      .select("id")
      .single();
    if (error?.code === "23505") return fail(`${values.code} already exists. Pick another code.`);
    if (error || !data) {
      console.error("[savePromoCode] insert failed:", error);
      return fail("Couldn't save the code. Try again.");
    }
    codeId = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("promo_codes")
      .update({ ...values, updated_at: now })
      .eq("id", codeId)
      .select("id");
    if (error?.code === "23505") return fail(`${values.code} already exists. Pick another code.`);
    if (error) {
      console.error("[savePromoCode] update failed:", error);
      return fail("Couldn't save the code. Try again.");
    }
    if (!data?.length) return fail(NO_CODE);
  }

  // The firm list, brought in line. firms_only is already saved, so while this
  // runs the code is only ever open to fewer firms, never to everyone.
  const { data: current, error: readError } = await supabase
    .from("promo_code_firms")
    .select("firm_id")
    .eq("promo_code_id", codeId);
  const listFailed = "The code is saved, but its firm list isn't. Edit it and save again.";
  if (readError) {
    console.error("[savePromoCode] firm list read failed:", readError);
    return fail(listFailed);
  }
  const had = new Set((current ?? []).map((r) => r.firm_id as string));
  const removed = Array.from(had).filter((firmId) => !firmIds.includes(firmId));
  const added = firmIds.filter((firmId) => !had.has(firmId));
  if (removed.length) {
    const { error } = await supabase
      .from("promo_code_firms")
      .delete()
      .eq("promo_code_id", codeId)
      .in("firm_id", removed);
    if (error) {
      console.error("[savePromoCode] firm list delete failed:", error);
      return fail(listFailed);
    }
  }
  if (added.length) {
    const { error } = await supabase
      .from("promo_code_firms")
      .insert(added.map((firmId) => ({ promo_code_id: codeId, firm_id: firmId })));
    if (error) {
      console.error("[savePromoCode] firm list insert failed:", error);
      return fail(listFailed);
    }
  }

  revalidatePath(PROMO_CODES_PATH);
  revalidatePath("/dashboard/Admin", "layout");
  return { ok: true };
}

/** Switches a code off, or back on. Cases that already have it keep their discount either way. */
export async function setPromoCodeActive(id: string, active: boolean): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id) || typeof active !== "boolean") return fail(NO_CODE);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[setPromoCodeActive] update failed:", error);
    return fail(active ? "Couldn't switch it on. Try again." : "Couldn't switch it off. Try again.");
  }
  if (!data?.length) return fail(NO_CODE);

  revalidatePath(PROMO_CODES_PATH);
  revalidatePath("/dashboard/Admin", "layout");
  return { ok: true };
}

/* =========================
   A CASE'S DISCOUNT
========================= */

/** The firm the case belongs to: requestee_id when set, else the creator. Null when there's no such case. */
async function caseFirm(caseId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("cases")
    .select("id, user_id, requestee_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) return null;
  return (data.requestee_id as string | null) || (data.user_id as string);
}

function revalidateCase(caseId: string) {
  revalidatePath(`/dashboard/Admin/${caseId}`);
  revalidatePath(`/dashboard/requestee/${caseId}`);
  revalidatePath(`/invoice/${caseId}`);
  revalidatePath(PROMO_CODES_PATH);
}

/** Puts a code on a firm's case, held to the code's limits for that firm. */
export async function adminApplyPromoCode(caseId: string, code: string): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId)) return fail(NO_CASE);
  const firmId = await caseFirm(caseId);
  if (!firmId) return fail(NO_CASE);

  const normalized = normalizePromoCode(code);
  if (!isValidPromoCode(normalized)) return fail(adminPromoMessage("not_found"));

  const { data, error } = await supabaseAdmin
    .rpc("apply_promo_code", {
      p_case_id: caseId,
      p_code: normalized,
      p_firm_id: firmId,
      p_applied_by: adminId,
      p_by_admin: true,
    })
    .maybeSingle();
  if (error) {
    console.error("[adminApplyPromoCode] apply failed:", error);
    return fail("Couldn't apply that code. Try again.");
  }
  const result = data as { outcome: string } | null;
  if (result?.outcome !== "applied") return fail(adminPromoMessage(result?.outcome));

  await syncInvoiceQuietly(caseId);
  revalidateCase(caseId);
  return { ok: true };
}

/** An admin's own percentage on a case, without a code. */
export async function adminSetCaseDiscount(caseId: string, percentOff: number): Promise<Result> {
  const adminId = await requireAdmin();
  if (!isUuid(caseId)) return fail(NO_CASE);
  if (!isValidPercentOff(percentOff)) return fail("The discount is a whole number from 1 to 99 percent.");
  if (!(await caseFirm(caseId))) return fail(NO_CASE);

  const { data, error } = await supabaseAdmin.rpc("set_case_discount", {
    p_case_id: caseId,
    p_percent_off: percentOff,
    p_applied_by: adminId,
  });
  if (error) {
    console.error("[adminSetCaseDiscount] set failed:", error);
    return fail("Couldn't save the discount. Try again.");
  }
  if (data === "paid") return fail(PAID_MESSAGE);
  if (data !== "applied") return fail("The discount is a whole number from 1 to 99 percent.");

  await syncInvoiceQuietly(caseId);
  revalidateCase(caseId);
  return { ok: true };
}

/** Takes the discount off a case, freeing its code's use. */
export async function adminRemoveCaseDiscount(caseId: string): Promise<Result> {
  await requireAdmin();
  if (!isUuid(caseId)) return fail(NO_CASE);

  const { data, error } = await supabaseAdmin.rpc("remove_case_discount", { p_case_id: caseId });
  if (error) {
    console.error("[adminRemoveCaseDiscount] remove failed:", error);
    return fail("Couldn't remove the discount. Try again.");
  }
  if (data === "paid") return fail(PAID_MESSAGE);

  await syncInvoiceQuietly(caseId);
  revalidateCase(caseId);
  return { ok: true };
}
