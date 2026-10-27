import { centralToday } from "@/lib/centralToday";
import { calendarDate } from "@/lib/timezone";

/**
 * Promo codes and the discount on a case (20261027_promo_codes.sql). Nothing
 * here touches the database, so the pages, the server actions and the tests
 * share it.
 *
 * A discount is a whole percentage, 1 to 99, off the case's whole total (base
 * hours and filters). A case has one at most: a code, or an admin's own
 * percentage. The percentage is copied onto the case when it's applied, and
 * nothing changes once the case is paid.
 */

export const MIN_PERCENT_OFF = 1;
export const MAX_PERCENT_OFF = 99;

/** The admin's Promo Codes page. */
export const PROMO_CODES_PATH = "/dashboard/Admin/requestees/promo-codes";

/** Capitals, digits, - and _, 3 to 32 of them; the database checks the same. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A code as it's kept: trimmed, in capitals. "fall10 " finds FALL10. */
export function normalizePromoCode(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

export function isValidPromoCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function isValidPercentOff(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_PERCENT_OFF && value <= MAX_PERCENT_OFF;
}

/** What a discount takes off, in whole cents. */
export function discountCents(subtotalCents: number, percentOff: number): number {
  return Math.round((subtotalCents * percentOff) / 100);
}

/** How the receipt and invoice name the discount. Just the percentage, never the code. */
export function discountLabel(percentOff: number): string {
  return `Discount (${percentOff}% off)`;
}

/** The discount on a case, as the case pages show it. */
export type CaseDiscount = {
  percentOff: number;
  /** The code it came from; null for an admin's own percentage. */
  code: string | null;
  appliedByAdmin: boolean;
  appliedAt: string;
};

/** What the database functions answer. */
export type PromoOutcome =
  | "ok"
  | "applied"
  | "not_found"
  | "inactive"
  | "not_for_firm"
  | "expired"
  | "used_up"
  | "paid";

export const PAID_MESSAGE = "This case has been paid, so its discount can't change.";

/**
 * What a firm is told when a code is refused. A code it can't use reads the
 * same as one that doesn't exist, so a firm learns nothing about another
 * firm's code or one we switched off.
 */
export function firmPromoMessage(outcome: string | null | undefined): string {
  switch (outcome) {
    case "not_found":
    case "inactive":
    case "not_for_firm":
      return "That promo code isn't valid. Check it and try again.";
    case "expired":
      return "That promo code has expired.";
    case "used_up":
      return "That promo code has been fully used.";
    case "paid":
      return PAID_MESSAGE;
    default:
      return "Couldn't apply that promo code. Try again.";
  }
}

/** What an admin is told when a code is refused: the actual reason. */
export function adminPromoMessage(outcome: string | null | undefined): string {
  switch (outcome) {
    case "not_found":
      return "There's no promo code by that name.";
    case "inactive":
      return "That code is switched off. Switch it on under Promo Codes first.";
    case "not_for_firm":
      return "That code isn't for this case's firm.";
    case "expired":
      return "That code is past its last day.";
    case "used_up":
      return "That code has no uses left.";
    case "paid":
      return PAID_MESSAGE;
    default:
      return "Couldn't apply that code. Try again.";
  }
}

/* =========================
   THE ADMIN'S LIST
========================= */

/** A row of public.promo_codes. */
export type PromoCodeRow = {
  id: string;
  code: string;
  percent_off: number;
  /** The last day it works, "YYYY-MM-DD" in Central Time. */
  expires_on: string | null;
  max_uses: number | null;
  firms_only: boolean;
  active: boolean;
  created_at: string;
};

export type PromoCodeStatus = "active" | "off" | "expired" | "used_up";

export const PROMO_CODE_STATUS_LABEL: Record<PromoCodeStatus, string> = {
  active: "Active",
  off: "Switched off",
  expired: "Expired",
  used_up: "Fully used",
};

/** Where a code stands, given how many cases hold it now. */
export function promoCodeStatus(
  code: Pick<PromoCodeRow, "active" | "expires_on" | "max_uses">,
  uses: number,
  today: string = centralToday(),
): PromoCodeStatus {
  if (!code.active) return "off";
  if (code.expires_on && code.expires_on < today) return "expired";
  if (code.max_uses != null && uses >= code.max_uses) return "used_up";
  return "active";
}

/** What the admin's form sends. */
export type PromoCodeInput = {
  code: string;
  percentOff: number;
  /** "YYYY-MM-DD", or null for no end date. */
  expiresOn: string | null;
  maxUses: number | null;
  firmsOnly: boolean;
  firmIds: string[];
};

export type PromoCodeValues = {
  code: string;
  percent_off: number;
  expires_on: string | null;
  max_uses: number | null;
  firms_only: boolean;
  /** Empty unless firms_only. */
  firmIds: string[];
};

/** The form's input as it will be saved, or why it can't be. */
export function parsePromoCodeInput(
  input: Partial<PromoCodeInput> | null | undefined,
): { ok: true; values: PromoCodeValues } | { ok: false; error: string } {
  const code = normalizePromoCode(input?.code);
  if (!isValidPromoCode(code)) {
    return { ok: false, error: "A code is 3 to 32 letters, digits, - or _, and starts with a letter or digit." };
  }
  if (!isValidPercentOff(input?.percentOff)) {
    return { ok: false, error: `The discount is a whole number from ${MIN_PERCENT_OFF} to ${MAX_PERCENT_OFF} percent.` };
  }

  let expiresOn: string | null = null;
  if (input?.expiresOn) {
    expiresOn = calendarDate(input.expiresOn);
    if (!expiresOn || expiresOn !== input.expiresOn) return { ok: false, error: "Pick a real date for the last day." };
  }

  const maxUses = input?.maxUses ?? null;
  if (maxUses !== null && !(Number.isInteger(maxUses) && maxUses >= 1)) {
    return { ok: false, error: "Max uses is a whole number, 1 or more. Leave it empty for no limit." };
  }

  const firmsOnly = input?.firmsOnly === true;
  const firmIds = firmsOnly ? Array.from(new Set(Array.isArray(input?.firmIds) ? input.firmIds : [])) : [];
  if (firmIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    return { ok: false, error: "A firm on the list doesn't exist. Refresh the page and try again." };
  }
  if (firmsOnly && firmIds.length === 0) {
    return { ok: false, error: "Pick at least one firm, or let every firm use it." };
  }

  return {
    ok: true,
    values: { code, percent_off: input!.percentOff!, expires_on: expiresOn, max_uses: maxUses, firms_only: firmsOnly, firmIds },
  };
}
