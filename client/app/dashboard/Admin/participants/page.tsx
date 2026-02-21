import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import NewParticipantsList from "@/components/NewParticipantsList";

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
        <Card className="border-muted/60 shadow-md">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-6">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Age
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Gender
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Phone
                  </TableHead>
                  {tab === "blacklisted" ? (
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Reason
                    </TableHead>
                  ) : (
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Registered
                    </TableHead>
                  )}
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pr-6">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {(enrichedParticipants ?? []).map((p) => {
                  const regDate = p.entry_date
                    ? new Date(p.entry_date).toLocaleDateString()
                    : "—";

                  return (
                    <TableRow
                      key={p.user_id}
                      className="group hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="font-medium text-foreground py-4 pl-6">
                        <Link
                          href={`/dashboard/participant/${p.user_id}`}
                          className="text-primary hover:text-primary/80 hover:underline"
                        >
                          {p.first_name} {p.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground">
                        {p.email || "—"}
                      </TableCell>
                      <TableCell className="py-4 text-sm">
                        {p.age || "—"}
                      </TableCell>
                      <TableCell className="py-4 text-sm capitalize">
                        {p.gender || "—"}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground">
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-muted-foreground">
                        {p.phone || "—"}
                      </TableCell>
                      {tab === "blacklisted" ? (
                        <TableCell className="py-4 text-sm text-red-600 max-w-[200px] truncate" title={p.blacklist_reason || ""}>
                          {p.blacklist_reason || "—"}
                        </TableCell>
                      ) : (
                        <TableCell className="py-4 text-sm text-muted-foreground">
                          {regDate}
                        </TableCell>
                      )}
                      <TableCell className="text-right py-4 pr-6">
                        {tab === "blacklisted" ? (
                          <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-400/20">
                            Blacklisted
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-400/10 px-2 py-1 text-xs font-medium text-green-500 ring-1 ring-inset ring-green-400/20">
                            Verified
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!enrichedParticipants?.length && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-16 text-muted-foreground italic"
                    >
                      {tab === "blacklisted"
                        ? "No blacklisted participants."
                        : "No approved participants yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
