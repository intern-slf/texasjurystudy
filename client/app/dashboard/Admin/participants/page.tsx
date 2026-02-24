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
  searchParams: Promise<{ tab?: ParticipantTab }>;
}) {
  const supabase = await createClient();
  const resolvedParams = await searchParams;
  const rawTab = resolvedParams?.tab;
  const tab: ParticipantTab =
    rawTab === "new" ? "new" : rawTab === "blacklisted" ? "blacklisted" : "approved";

  /* =========================
     FETCH PARTICIPANTS
  ========================= */

  let query = supabase
    .from("jury_participants")
    .select(
      "user_id, first_name, last_name, email, age, gender, city, state, phone, entry_date, approved_by_admin, driver_license_number, driver_license_image_url, blacklist_reason, blacklisted_at"
    )
    .order("entry_date", { ascending: false });

  if (tab === "blacklisted") {
    query = query.not("blacklisted_at", "is", null);
  } else if (tab === "new") {
    query = query.eq("approved_by_admin", false).is("blacklisted_at", null);
  } else {
    query = query.eq("approved_by_admin", true).is("blacklisted_at", null);
  }

  const { data: participants } = await query;

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
