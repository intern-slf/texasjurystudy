import { createClient } from "@/lib/supabase/server";

/* =========================
   TYPES (TS ONLY)
   ========================= */

type SessionCase = {
  start_time: string;
  end_time: string;
  cases: {
    id: string;
    title: string;
  } | null;
};

type Session = {
  id: string;
  session_date: string;
  created_at: string;
  session_cases: SessionCase[];
};

type SessionParticipant = {
  id: string;
  invite_status: string;
  responded_at: string | null;
  sessions: Session;
};

export default async function ParticipantSessionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <p>Not authenticated</p>;
  }

  const { data, error } = await supabase
    .from("session_participants")
    .select(`
      id,
      invite_status,
      responded_at,
      sessions (
        id,
        session_date,
        created_at,
        session_cases (
          start_time,
          end_time,
          cases (
            id,
            title
          )
        )
      )
    `)
    .eq("participant_id", user.id)
    .order("created_at", { foreignTable: "sessions", ascending: false });

  if (error) {
    console.error(error);
    return <p>Failed to load sessions</p>;
  }

  const sessions = data as SessionParticipant[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Session Requests</h1>

      {sessions.length === 0 && (
        <p className="text-muted-foreground">
          No session requests yet.
        </p>
      )}

      {sessions.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border p-4 space-y-3"
        >
          <div>
            <p className="font-medium">
              Session Date: {item.sessions.session_date}
            </p>
            <p className="text-sm text-muted-foreground">
              Status: {item.invite_status}
            </p>
          </div>

          <div className="space-y-2">
            {item.sessions.session_cases.map((sc, index) => (
              <div key={index} className="text-sm">
                {sc.cases?.title ?? "Case not available"} •{" "}
                {sc.start_time} → {sc.end_time}
              </div>
            ))}
          </div>

          {item.invite_status === "pending" && (
            <div className="flex gap-3">
              <form
                action={`/api/session-invite/${item.id}/accept`}
                method="post"
              >
                <button className="px-4 py-1 rounded bg-black text-white">
                  Accept
                </button>
              </form>

              <form
                action={`/api/session-invite/${item.id}/decline`}
                method="post"
              >
                <button className="px-4 py-1 rounded border">
                  Decline
                </button>
              </form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
