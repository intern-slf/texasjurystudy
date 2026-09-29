import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import BackButton from "@/components/BackButton";
import RequesteesTable, {
  type RequesteeCase,
  type RequesteeRow,
} from "@/components/RequesteesTable";

/* =========================
   HELPERS
========================= */

// Supabase/PostgREST caps a single response at 1000 rows by default, so we
// page through with .range() until a short page tells us we've hit the end.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  label: string,
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[requestees page] ${label} select failed:`, error);
      break;
    }

    if (!data?.length) break;

    rows.push(...data);

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

/* =========================
   PAGE
========================= */

export default async function RequesteesPage() {
  const supabase = await createClient();

  // Verify the current user is an admin. The layout checks too, but this page
  // reads agreements through the service-role client, so it guards itself.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: roleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleRow?.role !== "admin") redirect("/dashboard");

  /* =========================
     FETCH REQUESTEES, AGREEMENTS, CASES
  ========================= */

  const [roles, agreements, cases] = await Promise.all([
    fetchAllRows<{ user_id: string; email: string | null; created_at: string | null }>(
      "roles",
      (from, to) =>
        supabase
          .from("roles")
          .select("user_id, email, created_at")
          .eq("role", "requestee")
          .order("created_at", { ascending: false })
          .range(from, to)
    ),

    // Admins have no SELECT policy on this table — read via service role.
    // The confirmed full name lives here, not on the auth user.
    fetchAllRows<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      agreed_at: string | null;
    }>("agreements", (from, to) =>
      supabaseAdmin
        .from("confidentiality_agreements_requestee")
        .select("user_id, first_name, last_name, agreed_at")
        .range(from, to)
    ),

    fetchAllRows<RequesteeCase & { user_id: string; requestee_id: string | null }>(
      "cases",
      (from, to) =>
        supabase
          .from("cases")
          .select("id, title, admin_status, created_at, deleted_at, user_id, requestee_id")
          .order("created_at", { ascending: false })
          .range(from, to)
    ),
  ]);

  const agreementByUser = new Map(agreements.map((a) => [a.user_id, a]));

  // Same attribution as the admin case page: requestee_id if set, otherwise
  // the creator (cases are created with only user_id).
  const casesByUser = new Map<string, RequesteeCase[]>();
  for (const c of cases) {
    const ownerId = c.requestee_id || c.user_id;
    const list = casesByUser.get(ownerId) ?? [];
    list.push({
      id: c.id,
      title: c.title,
      admin_status: c.admin_status,
      created_at: c.created_at,
      deleted_at: c.deleted_at,
    });
    casesByUser.set(ownerId, list);
  }

  const requestees: RequesteeRow[] = roles.map((r) => {
    const agreement = agreementByUser.get(r.user_id);
    const name = agreement
      ? `${agreement.first_name ?? ""} ${agreement.last_name ?? ""}`.trim() || null
      : null;

    return {
      user_id: r.user_id,
      name,
      email: r.email,
      joined_at: r.created_at,
      agreed_at: agreement?.agreed_at ?? null,
      cases: casesByUser.get(r.user_id) ?? [],
    };
  });

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Requestees</h2>
          <p className="text-muted-foreground mt-1">
            Attorneys who request focus groups, with the cases each one has submitted.
          </p>
        </div>

        <BackButton href="/dashboard/Admin" label="Back to Cases" />
      </div>

      {/* ================= CONTENT ================= */}
      <RequesteesTable requestees={requestees} />
    </div>
  );
}
