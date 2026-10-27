import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminPage } from "@/lib/requireAdmin";
import BackButton from "@/components/BackButton";
import PromoCodesManager, { type FirmOption, type PromoCodeListItem } from "@/components/PromoCodesManager";
import { centralToday } from "@/lib/centralToday";
import { firmLabel } from "@/lib/slotBooking";
import { promoCodeStatus, type PromoCodeRow } from "@/lib/promoCode";

const PAGE_SIZE = 1000;

/** Every row a query returns, a page at a time: PostgREST stops at 1,000 rows. */
async function allRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>
): Promise<{ rows: T[]; error: { code?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null };
  }
}

type CodeRow = PromoCodeRow & { promo_code_firms: { firm_id: string }[] | null };

/* =========================
   PAGE
========================= */

export default async function PromoCodesPage() {
  // Firms' names are read with the service role below, so this page checks for
  // an admin itself: the layout's check doesn't re-run on every client-side
  // navigation (F28).
  await requireAdminPage();
  const supabase = await createClient();

  const [codes, discounts, firmRoles, agreements] = await Promise.all([
    allRows<CodeRow>((from, to) =>
      supabase
        .from("promo_codes")
        .select("id, code, percent_off, expires_on, max_uses, firms_only, active, created_at, promo_code_firms (firm_id)")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    // A use is a case holding the code now.
    allRows<{ promo_code_id: string }>((from, to) =>
      supabase.from("case_discounts").select("promo_code_id").not("promo_code_id", "is", null).range(from, to)
    ),
    allRows<{ user_id: string; email: string | null }>((from, to) =>
      supabase.from("roles").select("user_id, email").eq("role", "requestee").range(from, to)
    ),
    // Admins have no SELECT policy on this table; the confirmed name lives here.
    allRows<{ user_id: string; first_name: string | null; last_name: string | null }>((from, to) =>
      supabaseAdmin.from("confidentiality_agreements_requestee").select("user_id, first_name, last_name").range(from, to)
    ),
  ]);

  const error = codes.error ?? discounts.error;
  if (error) console.error("[promo codes page] select failed:", error);
  // PGRST205 / 42P01: the table isn't there, i.e. the migration hasn't been run.
  const tableMissing = error?.code === "PGRST205" || error?.code === "42P01";
  if (firmRoles.error) console.error("[promo codes page] firms failed:", firmRoles.error);
  if (agreements.error) console.error("[promo codes page] firm names failed:", agreements.error);

  const uses = new Map<string, number>();
  for (const d of discounts.rows) uses.set(d.promo_code_id, (uses.get(d.promo_code_id) ?? 0) + 1);

  const nameById = new Map(
    agreements.rows.map((a) => [a.user_id, `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || null])
  );
  const firms: FirmOption[] = firmRoles.rows
    .map((r) => ({ id: r.user_id, label: firmLabel(nameById.get(r.user_id), r.email), email: r.email }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const today = centralToday();
  const list: PromoCodeListItem[] = codes.rows.map(({ promo_code_firms, ...code }) => {
    const used = uses.get(code.id) ?? 0;
    return {
      ...code,
      firmIds: (promo_code_firms ?? []).map((f) => f.firm_id),
      uses: used,
      status: promoCodeStatus(code, used, today),
    };
  });

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Promo Codes</h2>
          <p className="text-muted-foreground mt-1">
            A percentage off a case&apos;s total. Firms enter a code on a new case or their case page; you can
            apply one on any case. Nothing changes once a case is paid.
          </p>
        </div>

        <BackButton href="/dashboard/Admin/requestees" label="Back to Requestees" />
      </div>

      {/* ================= CONTENT ================= */}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
          {tableMissing
            ? "The promo code tables don't exist yet. Run supabase/migrations/20261027_promo_codes.sql in the Supabase SQL Editor, then reload this page."
            : "Couldn't load the promo codes. Reload the page to try again."}
        </div>
      ) : (
        <>
          {(firmRoles.error || agreements.error) && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
              Couldn&apos;t load every firm, so the firm list may be incomplete or show emails instead of names.
              Reload the page before limiting a code to firms.
            </div>
          )}
          <PromoCodesManager codes={list} firms={firms} />
        </>
      )}
    </div>
  );
}
