import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SessionsPage() {
  const supabase = await createClient();

  /* =========================
     FETCH SESSIONS
  ========================= */

  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id,
      session_date,
      created_by,
      session_cases (
        start_time,
        end_time,
        cases ( id, title )
      ),
      session_participants (
        invite_status,
        jury_participants (
          user_id,
          first_name,
          last_name
        )
      )
    `)
    .order("session_date", { ascending: false });

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>

        <Link
          href="/dashboard/Admin"
          className="text-sm underline"
        >
          ← Back to Cases
        </Link>
      </div>

      {/* LIST */}
      {sessions?.length ? (
        sessions.map((s) => (
          <div
            key={s.id}
            className="border rounded p-6 space-y-6 bg-white shadow-sm"
          >
            {/* SESSION INFO */}
            <div>
              <div className="text-lg font-semibold">
                {s.session_date}
              </div>
              <div className="text-xs text-slate-500">
                Session ID: {s.id}
              </div>
            </div>

            {/* CASES */}
            <div>
              <h2 className="font-medium mb-2">Cases</h2>

              <div className="space-y-2">
                {s.session_cases?.length ? (
                  s.session_cases.map((sc, i) => {
                    const caseItem = sc.cases?.[0];

                    return (
                      <div
                        key={i}
                        className="text-sm flex justify-between border rounded px-3 py-2"
                      >
                        <span>{caseItem?.title ?? "Unknown case"}</span>
                        <span>
                          {sc.start_time} → {sc.end_time}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    No cases assigned.
                  </div>
                )}
              </div>
            </div>

            {/* PARTICIPANTS */}
            <div>
              <h2 className="font-medium mb-2">Participants</h2>

              <div className="space-y-2">
                {s.session_participants?.length ? (
                  s.session_participants.map((p, i) => {
                    const person = p.jury_participants?.[0];

                    return (
                      <div
                        key={i}
                        className="text-sm flex justify-between border rounded px-3 py-2"
                      >
                        <span>
                          {person?.first_name} {person?.last_name}
                        </span>

                        <span className="capitalize text-xs font-semibold">
                          {p.invite_status ?? "pending"}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    No participants invited.
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-slate-400 italic">
          No sessions created yet.
        </div>
      )}
    </div>
  );
}
