import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "./helpers/fakeSupabase";

// ---------------------------------------------------------------------------
// The promo code server actions: the firm's (lib/actions/requesteePromoCode.ts)
// and the admin's (lib/actions/adminPromoCode.ts). Server actions are public
// endpoints, so each one is also called by the wrong kind of caller, who must
// get nowhere.
//
// The database functions they call (apply_promo_code and the rest, in
// 20261027_promo_codes.sql) are stood in for by `rpc`, which records each call
// and answers what a test tells it to: the rules themselves are checked by the
// migration's self-check. What's tested here is what the actions send them,
// who may call them, and what the caller is told.
// ---------------------------------------------------------------------------

const db = new FakeDb();
const caller: { id: string | null } = { id: null };

type RpcAnswer = { data: unknown; error: { message: string } | null };
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcAnswer: (name: string, args: Record<string, unknown>) => RpcAnswer = () => ({ data: null, error: null });

// Like supabase-js: awaitable for a function returning one value, and
// .maybeSingle() for one returning rows.
function rpc(name: string, args: Record<string, unknown>) {
  rpcCalls.push({ name, args });
  const answer = rpcAnswer(name, args);
  return {
    maybeSingle: async () => ({
      data: Array.isArray(answer.data) ? (answer.data[0] ?? null) : answer.data,
      error: answer.error,
    }),
    then: (resolve: (v: RpcAnswer) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(answer).then(resolve, reject),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: caller.id ? { id: caller.id } : null } })) },
    from: (table: string) => db.from(table),
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => db.from(table),
    rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
  },
}));
// What brings the case's invoice up to date; tested in invoice.test.ts.
const syncInvoiceQuietly = vi.hoisted(() => vi.fn<(caseId: string) => Promise<void>>(async () => {}));
vi.mock("@/lib/invoiceData", () => ({ syncInvoiceQuietly }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyPromoCode, checkPromoCode, removePromoCode } from "@/lib/actions/requesteePromoCode";
import {
  adminApplyPromoCode,
  adminRemoveCaseDiscount,
  adminSetCaseDiscount,
  savePromoCode,
  setPromoCodeActive,
} from "@/lib/actions/adminPromoCode";
import { PAID_MESSAGE, adminPromoMessage, firmPromoMessage, type PromoCodeInput } from "@/lib/promoCode";

const ADMIN = "0a000000-0000-4000-8000-000000000001";
const FIRM = "0f000000-0000-4000-8000-000000000001";
const OTHER_FIRM = "0f000000-0000-4000-8000-000000000002";
const PARTICIPANT = "0b000000-0000-4000-8000-000000000001";
const CASE = "0c000000-0000-4000-8000-000000000001";
const OTHER_FIRMS_CASE = "0c000000-0000-4000-8000-000000000002";
// Created by staff, assigned to FIRM through requestee_id.
const ASSIGNED_CASE = "0c000000-0000-4000-8000-000000000003";
const CODE_ID = "0d000000-0000-4000-8000-000000000001";

function seed() {
  db.reset({
    roles: [
      { user_id: ADMIN, role: "admin", email: "admin@tjs.test" },
      { user_id: FIRM, role: "requestee", email: "firm@example.com" },
      { user_id: OTHER_FIRM, role: "requestee", email: "other@example.com" },
      { user_id: PARTICIPANT, role: "participant", email: "p@example.com" },
    ],
    cases: [
      { id: CASE, user_id: FIRM, requestee_id: null },
      { id: OTHER_FIRMS_CASE, user_id: OTHER_FIRM, requestee_id: null },
      { id: ASSIGNED_CASE, user_id: ADMIN, requestee_id: FIRM },
    ],
    promo_codes: [],
    promo_code_firms: [],
  });
}

beforeEach(() => {
  seed();
  caller.id = null;
  rpcCalls.length = 0;
  rpcAnswer = () => ({ data: null, error: null });
  syncInvoiceQuietly.mockClear();
});

const answers = (data: unknown): typeof rpcAnswer => () => ({ data, error: null });

/* =========================
   THE FIRM'S ACTIONS
========================= */

describe("who may use the firm's actions", () => {
  it.each([
    ["signed out", null, "Not authenticated"],
    ["a participant", PARTICIPANT, "Not authorized"],
    ["an admin (who has their own actions)", ADMIN, "Not authorized"],
  ])("refuses %s", async (_label, id, message) => {
    caller.id = id;
    await expect(checkPromoCode("FALL10")).rejects.toThrow(message);
    await expect(applyPromoCode(CASE, "FALL10")).rejects.toThrow(message);
    await expect(removePromoCode(CASE)).rejects.toThrow(message);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("checking a code on the new-case form", () => {
  beforeEach(() => {
    caller.id = FIRM;
  });

  it("checks it in capitals, for the caller's own firm, and says what it takes off", async () => {
    rpcAnswer = answers([{ outcome: "ok", promo_code_id: CODE_ID, percent_off: 15 }]);
    expect(await checkPromoCode(" fall10 ")).toEqual({ ok: true, code: "FALL10", percentOff: 15 });
    expect(rpcCalls).toEqual([{ name: "check_promo_code", args: { p_code: "FALL10", p_firm_id: FIRM } }]);
  });

  it("saves nothing and touches no invoice", async () => {
    rpcAnswer = answers([{ outcome: "ok", promo_code_id: CODE_ID, percent_off: 15 }]);
    await checkPromoCode("FALL10");
    expect(db.writes).toEqual([]);
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it("says the same for another firm's code, a switched-off one and one that doesn't exist", async () => {
    const said: string[] = [];
    for (const outcome of ["not_found", "inactive", "not_for_firm"]) {
      rpcAnswer = answers([{ outcome, promo_code_id: null, percent_off: null }]);
      const result = await checkPromoCode("FALL10");
      expect(result.ok).toBe(false);
      if (!result.ok) said.push(result.error);
    }
    expect(new Set(said)).toEqual(new Set([firmPromoMessage("not_found")]));
  });

  it("doesn't ask the database about something that can't be a code", async () => {
    expect(await checkPromoCode("no")).toEqual({ ok: false, error: firmPromoMessage("not_found") });
    expect(await checkPromoCode("FALL 10!")).toEqual({ ok: false, error: firmPromoMessage("not_found") });
    expect(rpcCalls).toHaveLength(0);
  });

  it("says so when the check itself fails", async () => {
    rpcAnswer = () => ({ data: null, error: { message: "boom" } });
    const result = await checkPromoCode("FALL10");
    expect(result).toEqual({ ok: false, error: "Couldn't check that promo code. Try again." });
  });
});

describe("a firm applying a code to its case", () => {
  beforeEach(() => {
    caller.id = FIRM;
    rpcAnswer = answers([{ outcome: "applied", percent_off: 10 }]);
  });

  it("applies it for the case's firm, as the firm, and brings the invoice up to date", async () => {
    expect(await applyPromoCode(CASE, "fall10")).toEqual({ ok: true, percentOff: 10 });
    expect(rpcCalls).toEqual([
      {
        name: "apply_promo_code",
        args: { p_case_id: CASE, p_code: "FALL10", p_firm_id: FIRM, p_applied_by: FIRM, p_by_admin: false },
      },
    ]);
    expect(syncInvoiceQuietly).toHaveBeenCalledWith(CASE);
  });

  it("works on a case assigned to the firm by staff, checking the code against that firm", async () => {
    expect(await applyPromoCode(ASSIGNED_CASE, "FALL10")).toEqual({ ok: true, percentOff: 10 });
    expect(rpcCalls[0].args.p_firm_id).toBe(FIRM);
  });

  it("treats another firm's case as one that doesn't exist", async () => {
    expect(await applyPromoCode(OTHER_FIRMS_CASE, "FALL10")).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(await applyPromoCode("0c000000-0000-4000-8000-0000000000ff", "FALL10")).toEqual({
      ok: false,
      error: "That case doesn't exist.",
    });
    expect(await applyPromoCode("not-a-case", "FALL10")).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(rpcCalls).toHaveLength(0);
  });

  it("changes nothing on a paid case", async () => {
    rpcAnswer = answers([{ outcome: "paid", percent_off: null }]);
    expect(await applyPromoCode(CASE, "FALL10")).toEqual({ ok: false, error: PAID_MESSAGE });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it.each(["expired", "used_up", "not_for_firm"])("passes on a refusal (%s) in the firm's words", async (outcome) => {
    rpcAnswer = answers([{ outcome, percent_off: null }]);
    expect(await applyPromoCode(CASE, "FALL10")).toEqual({ ok: false, error: firmPromoMessage(outcome) });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it("says so when the database fails, and syncs nothing", async () => {
    rpcAnswer = () => ({ data: null, error: { message: "boom" } });
    expect(await applyPromoCode(CASE, "FALL10")).toEqual({
      ok: false,
      error: "Couldn't apply that promo code. Try again.",
    });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });
});

describe("a firm removing the discount from its case", () => {
  beforeEach(() => {
    caller.id = FIRM;
  });

  it("removes any discount on its unpaid case, an admin's included", async () => {
    rpcAnswer = answers("removed");
    expect(await removePromoCode(CASE)).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ name: "remove_case_discount", args: { p_case_id: CASE } }]);
    expect(syncInvoiceQuietly).toHaveBeenCalledWith(CASE);
  });

  it("is refused once the case is paid", async () => {
    rpcAnswer = answers("paid");
    expect(await removePromoCode(CASE)).toEqual({ ok: false, error: PAID_MESSAGE });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it("can't touch another firm's case", async () => {
    expect(await removePromoCode(OTHER_FIRMS_CASE)).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(rpcCalls).toHaveLength(0);
  });
});

/* =========================
   THE ADMIN'S ACTIONS
========================= */

const newCode = (change: Partial<PromoCodeInput> = {}): PromoCodeInput => ({
  code: "fall10",
  percentOff: 10,
  expiresOn: null,
  maxUses: null,
  firmsOnly: false,
  firmIds: [],
  ...change,
});

describe("who may use the admin's actions", () => {
  it.each([
    ["signed out", null, "Not authenticated"],
    ["a participant", PARTICIPANT, "Not authorized"],
    ["a firm", FIRM, "Not authorized"],
  ])("refuses %s", async (_label, id, message) => {
    caller.id = id;
    await expect(savePromoCode(null, newCode())).rejects.toThrow(message);
    await expect(setPromoCodeActive(CODE_ID, false)).rejects.toThrow(message);
    await expect(adminApplyPromoCode(CASE, "FALL10")).rejects.toThrow(message);
    await expect(adminSetCaseDiscount(CASE, 50)).rejects.toThrow(message);
    await expect(adminRemoveCaseDiscount(CASE)).rejects.toThrow(message);
    expect(rpcCalls).toHaveLength(0);
    expect(db.writes).toEqual([]);
  });
});

describe("an admin creating and editing codes", () => {
  beforeEach(() => {
    caller.id = ADMIN;
  });

  it("creates a code in capitals, open to every firm", async () => {
    expect(await savePromoCode(null, newCode())).toEqual({ ok: true });
    expect(db.rows("promo_codes")).toEqual([
      expect.objectContaining({
        code: "FALL10",
        percent_off: 10,
        expires_on: null,
        max_uses: null,
        firms_only: false,
        created_by: ADMIN,
      }),
    ]);
    expect(db.rows("promo_code_firms")).toEqual([]);
  });

  it("creates one for chosen firms, with a last day and a use limit", async () => {
    const result = await savePromoCode(
      null,
      newCode({ expiresOn: "2026-12-31", maxUses: 3, firmsOnly: true, firmIds: [FIRM, OTHER_FIRM] })
    );
    expect(result).toEqual({ ok: true });
    const [code] = db.rows("promo_codes");
    expect(code).toMatchObject({ expires_on: "2026-12-31", max_uses: 3, firms_only: true });
    expect(db.rows("promo_code_firms")).toEqual([
      { promo_code_id: code.id, firm_id: FIRM },
      { promo_code_id: code.id, firm_id: OTHER_FIRM },
    ]);
  });

  it("refuses a firm list with someone who isn't a firm, and saves nothing", async () => {
    const result = await savePromoCode(null, newCode({ firmsOnly: true, firmIds: [FIRM, PARTICIPANT] }));
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("refuses a code that already exists, whatever case it's typed in", async () => {
    await savePromoCode(null, newCode());
    expect(await savePromoCode(null, newCode({ code: "Fall10" }))).toEqual({
      ok: false,
      error: "FALL10 already exists. Pick another code.",
    });
    expect(db.rows("promo_codes")).toHaveLength(1);
  });

  it("refuses 100% and saves nothing", async () => {
    const result = await savePromoCode(null, newCode({ percentOff: 100 }));
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("edits a code and brings its firm list in line, keeping the firms still on it", async () => {
    await savePromoCode(null, newCode({ firmsOnly: true, firmIds: [FIRM, OTHER_FIRM] }));
    const [code] = db.rows("promo_codes");
    const NEW_FIRM = "0f000000-0000-4000-8000-000000000003";
    db.rows("roles").push({ user_id: NEW_FIRM, role: "requestee", email: "new@example.com" });

    const result = await savePromoCode(
      code.id as string,
      newCode({ percentOff: 20, firmsOnly: true, firmIds: [FIRM, NEW_FIRM] })
    );
    expect(result).toEqual({ ok: true });
    expect(db.rows("promo_codes")[0]).toMatchObject({ percent_off: 20 });
    expect(db.rows("promo_code_firms").map((r) => r.firm_id).sort()).toEqual([FIRM, NEW_FIRM].sort());
  });

  it("opens a code to every firm by emptying its list", async () => {
    await savePromoCode(null, newCode({ firmsOnly: true, firmIds: [FIRM] }));
    const [code] = db.rows("promo_codes");
    expect(await savePromoCode(code.id as string, newCode())).toEqual({ ok: true });
    expect(db.rows("promo_codes")[0]).toMatchObject({ firms_only: false });
    expect(db.rows("promo_code_firms")).toEqual([]);
  });

  it("says so when the code to edit is gone", async () => {
    expect(await savePromoCode(CODE_ID, newCode())).toEqual({
      ok: false,
      error: "That code doesn't exist. Refresh the page.",
    });
  });

  it("switches a code off and back on", async () => {
    await savePromoCode(null, newCode());
    const [code] = db.rows("promo_codes");
    expect(await setPromoCodeActive(code.id as string, false)).toEqual({ ok: true });
    expect(db.rows("promo_codes")[0].active).toBe(false);
    expect(await setPromoCodeActive(code.id as string, true)).toEqual({ ok: true });
    expect(db.rows("promo_codes")[0].active).toBe(true);
  });
});

describe("an admin putting a discount on a firm's case", () => {
  beforeEach(() => {
    caller.id = ADMIN;
  });

  it("applies a code as an admin, held to its limits for the case's firm", async () => {
    rpcAnswer = answers([{ outcome: "applied", percent_off: 10 }]);
    expect(await adminApplyPromoCode(ASSIGNED_CASE, "fall10")).toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      {
        name: "apply_promo_code",
        args: { p_case_id: ASSIGNED_CASE, p_code: "FALL10", p_firm_id: FIRM, p_applied_by: ADMIN, p_by_admin: true },
      },
    ]);
    expect(syncInvoiceQuietly).toHaveBeenCalledWith(ASSIGNED_CASE);
  });

  it("is told the actual reason a code was refused", async () => {
    rpcAnswer = answers([{ outcome: "not_for_firm", percent_off: null }]);
    expect(await adminApplyPromoCode(CASE, "FALL10")).toEqual({ ok: false, error: adminPromoMessage("not_for_firm") });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it("sets a percentage of our own, without a code", async () => {
    rpcAnswer = answers("applied");
    expect(await adminSetCaseDiscount(CASE, 25)).toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      { name: "set_case_discount", args: { p_case_id: CASE, p_percent_off: 25, p_applied_by: ADMIN } },
    ]);
    expect(syncInvoiceQuietly).toHaveBeenCalledWith(CASE);
  });

  it.each([0, 100, 12.5, Number.NaN])("refuses %s%% without asking the database", async (percent) => {
    const result = await adminSetCaseDiscount(CASE, percent);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("changes nothing on a paid case", async () => {
    rpcAnswer = answers("paid");
    expect(await adminSetCaseDiscount(CASE, 25)).toEqual({ ok: false, error: PAID_MESSAGE });
    rpcAnswer = answers([{ outcome: "paid", percent_off: null }]);
    expect(await adminApplyPromoCode(CASE, "FALL10")).toEqual({ ok: false, error: PAID_MESSAGE });
    rpcAnswer = answers("paid");
    expect(await adminRemoveCaseDiscount(CASE)).toEqual({ ok: false, error: PAID_MESSAGE });
    expect(syncInvoiceQuietly).not.toHaveBeenCalled();
  });

  it("removes a discount, freeing its code's use", async () => {
    rpcAnswer = answers("removed");
    expect(await adminRemoveCaseDiscount(CASE)).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ name: "remove_case_discount", args: { p_case_id: CASE } }]);
    expect(syncInvoiceQuietly).toHaveBeenCalledWith(CASE);
  });

  it("says so for a case that doesn't exist", async () => {
    const missing = "0c000000-0000-4000-8000-0000000000ff";
    expect(await adminApplyPromoCode(missing, "FALL10")).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(await adminSetCaseDiscount(missing, 10)).toEqual({ ok: false, error: "That case doesn't exist." });
    expect(rpcCalls).toHaveLength(0);
  });
});
