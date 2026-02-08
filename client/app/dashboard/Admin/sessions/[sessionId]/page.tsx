export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* =========================
   TYPES
   ========================= */

type ParticipantRow = {
  id: string;
  invite_status: "pending" | "accepted" | "declined";
  responded_at: string | null;
  profiles: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
};

/* =========================
   PAGE
   ========================= */

export default async function AdminSessionParticipantsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = await createClient();
  const { sessionId } = params;

  /* =========================
     FETCH PARTICIPANTS
     ========================= */

  const { data, error } = await supabase
    .from("session_participants")
    .select(`
      id,
      invite_status,
      responded_at,
      profiles (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .eq("session_id", sessionId)
    .order("responded_at", { ascending: false });

  if (error) {
    console.error(error);
    return <p className="text-red-500">Failed to load participants</p>;
  }

  const participants = (data ?? []) as ParticipantRow[];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Session Participants</h2>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responded At</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.profiles.first_name} {p.profiles.last_name}
                </TableCell>

                <TableCell className="text-slate-600">
                  {p.profiles.email}
                </TableCell>

                <TableCell>
                  <span
                    className={
                      p.invite_status === "accepted"
                        ? "text-green-600 font-semibold"
                        : p.invite_status === "declined"
                        ? "text-red-600 font-semibold"
                        : "text-yellow-600 font-semibold"
                    }
                  >
                    {p.invite_status === "accepted"
                      ? "Approved"
                      : p.invite_status === "declined"
                      ? "Declined"
                      : "Pending"}
                  </span>
                </TableCell>

                <TableCell className="text-slate-500 text-sm">
                  {p.responded_at
                    ? new Date(p.responded_at).toLocaleString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}

            {!participants.length && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-12 text-slate-400 italic"
                >
                  No participants found for this session.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
