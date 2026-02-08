import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SessionsPage() {
  const supabase = await createClient();

  /* =========================
     FETCH SESSIONS
  ========================= */

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, created_by")
    .order("session_date", { ascending: false });

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>

        <Link href="/dashboard/Admin" className="text-sm underline">
          ← Back to Cases
        </Link>
      </div>

      {/* LIST */}
      {sessions?.length ? (
        await Promise.all(
          sessions.map(async (s) => {
            /* =========================
               FETCH CASES OF SESSION
            ========================= */
            const { data: scases } = await supabase
              .from("session_cases")
              .select("case_id, start_time, end_time")
              .eq("session_id", s.id);

            const caseIds = scases?.map((c) => c.case_id) ?? [];

            const { data: caseDetails } = caseIds.length
              ? await supabase
                  .from("cases")
                  .select("id, title")
                  .in("id", caseIds)
              : { data: [] };

            /* =========================
               FETCH PARTICIPANTS
            ========================= */
            const { data: sParticipants } = await supabase
              .from("session_participants")
              .select("participant_id, invite_status")
              .eq("session_id", s.id);

            const participantIds =
              sParticipants?.map((p) => p.participant_id) ?? [];

            const { data: participantDetails } = participantIds.length
              ? await supabase
                  .from("jury_participants")
                  .select("user_id, first_name, last_name")
                  .in("user_id", participantIds)
              : { data: [] };

            return (
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
                    {scases?.length ? (
                      scases.map((c, i) => {
                        const detail = caseDetails?.find(
                          (x) => x.id === c.case_id
                        );

                        return (
                          <div
                            key={i}
                            className="text-sm flex justify-between border rounded px-3 py-2"
                          >
                            <span>{detail?.title ?? "Unknown case"}</span>
                            <span>
                              {c.start_time} → {c.end_time}
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
                    {sParticipants?.length ? (
                      sParticipants.map((p, i) => {
                        const detail = participantDetails?.find(
                          (x) => x.user_id === p.participant_id
                        );

                        return (
                          <div
                            key={i}
                            className="text-sm flex justify-between border rounded px-3 py-2"
                          >
                            <span>
                              {detail?.first_name} {detail?.last_name}
                            </span>

                            <span className="capitalize text-xs font-semibold">
                              {p.invite_status}
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
            );
          })
        )
      ) : (
        <div className="text-slate-400 italic">
          No sessions created yet.
        </div>
      )}
    </div>
  );
}
