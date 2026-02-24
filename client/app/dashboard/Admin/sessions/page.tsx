import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";


async function submitSession(formData: FormData) {
  "use server";

  const sessionId = formData.get("sessionId") as string;
  const supabase = await createClient();

  // get all case ids in session
  const { data: sessionCases } = await supabase
    .from("session_cases")
    .select("case_id")
    .eq("session_id", sessionId);

  const ids = sessionCases?.map((c) => c.case_id) ?? [];

  if (ids.length) {
    await supabase
      .from("cases")
      .update({ admin_status: "submitted" })
      .in("id", ids);
  }

  revalidatePath("/dashboard/Admin");
  revalidatePath("/dashboard/Admin/sessions");
}


export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const showSuccess = params?.created === "1";

  /* =========================
     FETCH SESSIONS
  ========================= */

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, created_by")
    .order("session_date", { ascending: false });

  return (
    <div className="space-y-8">
      {/* ====== SUCCESS BANNER ====== */}
      {showSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <span className="text-xl">✅</span>
          <div>
            <p className="font-semibold text-sm">Session created successfully!</p>
            <p className="text-xs text-green-600 mt-0.5">Invitations have been sent to all selected participants.</p>
          </div>
        </div>
      )}

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
                .select("id, title, admin_status")
                .in("id", caseIds)
              : { data: [] };

            /* =========================
               FETCH PARTICIPANTS
            ========================= */
            const alreadySubmitted = Boolean(
              caseDetails?.length &&
              caseDetails.every((c) => c.admin_status === "submitted")
            );
            const { data: sParticipants } = await supabase
              .from("session_participants")
              .select("participant_id, invite_status")
              .eq("session_id", s.id);

            const participantIds =
              sParticipants?.map((p) => p.participant_id) ?? [];

            let participantDetails: any[] = [];
            if (participantIds.length) {
              const { data: jData } = await supabase
                .from("jury_participants")
                .select("user_id, first_name, last_name")
                .in("user_id", participantIds);

              participantDetails = jData ?? [];

              // Fallback to oldData for missing participants
              const foundIds = new Set(participantDetails.map(p => p.user_id));
              const missingIds = participantIds.filter(id => !foundIds.has(id));

              if (missingIds.length > 0) {
                const { data: oData } = await supabase
                  .from("oldData")
                  .select("id, first_name, last_name")
                  .in("id", missingIds);

                if (oData) {
                  participantDetails.push(...oData.map(od => ({
                    user_id: od.id,
                    first_name: od.first_name,
                    last_name: od.last_name
                  })));
                }
              }
            }

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
                <form action={submitSession} className="flex justify-end">
                  <input type="hidden" name="sessionId" value={s.id} />

                  <button
                    disabled={alreadySubmitted}
                    className={`px-4 py-2 rounded text-sm text-white ${alreadySubmitted
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                      }`}
                  >
                    {alreadySubmitted ? "Already Submitted" : "Submit Session"}
                  </button>
                </form>

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
