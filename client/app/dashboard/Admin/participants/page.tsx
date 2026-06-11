import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import NewParticipantsList from "@/components/NewParticipantsList";
import ParticipantsTable from "@/components/ParticipantsTable";

/* =========================
   TYPES
========================= */

type ParticipantTab = "approved" | "new" | "blacklisted";

/* =========================
   PAGE
========================= */

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: ParticipantTab; sent?: string; failed?: string }>;
}) {
  const supabase = await createClient();
  const resolvedParams = await searchParams;
  const rawTab = resolvedParams?.tab;
  const tab: ParticipantTab =
    rawTab === "new" ? "new" : rawTab === "blacklisted" ? "blacklisted" : "approved";

  const sentCount = Number(resolvedParams?.sent);
  const failedCount = Number(resolvedParams?.failed);
  const showSentBanner = Number.isFinite(sentCount) && sentCount > 0;
  const showFailedBanner = Number.isFinite(failedCount) && failedCount > 0;

  /* =========================
     FETCH PARTICIPANTS
  ========================= */

  // Supabase/PostgREST caps a single response at 1000 rows by default, so we
  // page through with .range() until a short page tells us we've hit the end.
  const PAGE_SIZE = 1000;

  const buildQuery = () => {
    let query = supabase
      .from("jury_participants")
      .select(
        "user_id, first_name, last_name, email, gender, city, state, phone, date_of_birth, entry_date, approved_by_admin, driver_license_number, driver_license_image_url, blacklist_reason, blacklisted_at, reactivation_status, reactivation_email_sent_at, reactivation_confirmed_at"
      )
      .order("entry_date", { ascending: false });

    if (tab === "blacklisted") {
      query = query.not("blacklisted_at", "is", null);
    } else if (tab === "new") {
      query = query.eq("approved_by_admin", false).is("blacklisted_at", null);
    } else {
      query = query.eq("approved_by_admin", true).is("blacklisted_at", null);
    }

    return query;
  };

  type ParticipantRow = NonNullable<
    Awaited<ReturnType<ReturnType<typeof buildQuery>["range"]>>["data"]
  >[number];

  const participants: ParticipantRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[participants page] supabase select failed:", error);
      break;
    }

    if (!data?.length) break;

    participants.push(...data);

    if (data.length < PAGE_SIZE) break;
  }

  /* =========================
     GENERATE SIGNED URLs FOR ID IMAGES (new tab only)
  ========================= */

  type ParticipantWithUrl = NonNullable<typeof participants>[number] & {
    idSignedUrl: string | null;
  };

  let enrichedParticipants: ParticipantWithUrl[] = [];

  if (participants) {
    enrichedParticipants = await Promise.all(
      participants.map(async (p) => {
        let idSignedUrl: string | null = null;

        if (p.driver_license_image_url) {
          const { data } = await supabase.storage
            .from("id-documents")
            .createSignedUrl(p.driver_license_image_url, 3600);
          idSignedUrl = data?.signedUrl || null;
        }

        return { ...p, idSignedUrl };
      })
    );
  }

  return (
    <div className="space-y-6">
      {(showSentBanner || showFailedBanner) && (
        <div className="space-y-2">
          {showSentBanner && (
            <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
              Reactivation email sent to {sentCount} participant{sentCount === 1 ? "" : "s"}.
            </div>
          )}
          {showFailedBanner && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {failedCount} email{failedCount === 1 ? "" : "s"} could not be sent. Check the server logs for details.
            </div>
          )}
        </div>
      )}

      {/* ================= HEADER ================= */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {tab === "approved"
              ? "Participants"
              : tab === "blacklisted"
                ? "Blacklisted"
                : "New Participants"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {tab === "approved"
              ? "All approved and verified participants."
              : tab === "blacklisted"
                ? "Participants who have been blacklisted."
                : "Review and approve new participant registrations."}
          </p>
        </div>

        <Link
          href="/dashboard/Admin"
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Cases
        </Link>
      </div>

      {/* ================= CONTENT ================= */}
      {tab === "new" ? (
        /* CARD VIEW for new participants */
        <NewParticipantsList participants={enrichedParticipants} />
      ) : (
        /* TABLE VIEW for approved or blacklisted participants */
        <ParticipantsTable
          participants={enrichedParticipants}
          tab={tab === "blacklisted" ? "blacklisted" : "approved"}
        />
      )}
    </div>
  );
}
