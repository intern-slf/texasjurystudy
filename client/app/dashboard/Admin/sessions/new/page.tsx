import { createClient } from "@/lib/supabase/server";
import {
  createSession,
  addCasesToSession,
  inviteParticipants,
} from "@/lib/actions/session";
import {
  combineCaseFilters,
  applyCaseFilters,
  relaxFilters,
  FILTER_PRIORITY,
  CaseFilters
} from "@/lib/filter-utils";
import Link from "next/link";

/* =========================
   PAGE
========================= */

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ selectedCases?: string | string[] }>;
}) {
  const supabase = await createClient();

  /* =========================
     READ SELECTED IDS
  ========================= */
  const params = await searchParams;

  const selectedIds = params?.selectedCases
    ? Array.isArray(params.selectedCases)
      ? params.selectedCases
      : [params.selectedCases]
    : [];

  /* =========================
     FETCH ONLY SELECTED CASES
  ========================= */

  const { data: cases } = selectedIds.length
    ? await supabase
      .from("cases")
      .select("id, title, scheduled_at, schedule_status")
      .in("id", selectedIds)
      .order("created_at", { ascending: false })
    : { data: [] };

  // Participants for sidebar
  const { data: participants } = await supabase
    .from("jury_participants")
    .select("user_id, first_name, last_name, age, city")
    .order("first_name");

  /* =========================
     SERVER ACTION
  ========================= */

  async function handleCreate(formData: FormData) {
    "use server";

    const date = formData.get("session_date") as string;

    if (!date) throw new Error("Session date required");

    // create session
    const sessionId = await createSession(date);

    // attach cases
    const selectedCases = (cases ?? [])
      .map((c) => {
        const start = formData.get(`start_${c.id}`) as string;
        const end = formData.get(`end_${c.id}`) as string;

        if (!start || !end) return null;

        return {
          caseId: c.id,
          start,
          end,
        };
      })
      .filter(Boolean) as { caseId: string; start: string; end: string }[];

    if (selectedCases.length) {
      await addCasesToSession(sessionId, selectedCases);
    }

    // invite participants
    const selectedParticipants = formData.getAll(
      "participants"
    ) as string[];

    if (selectedParticipants.length) {
      await inviteParticipants(sessionId, selectedParticipants);
    }
  }

  /* =========================
     UI
  ========================= */

  return (
    <form action={handleCreate} className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Create Session</h1>

        <Link href="/dashboard/Admin" className="text-sm underline">
          ← Back
        </Link>
      </div>

      {/* DATE */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Session Date
        </label>
        <input
          type="date"
          name="session_date"
          required
          className="border rounded px-3 py-2"
        />
      </div>

      {/* SPLIT */}
      <div className="grid grid-cols-2 gap-8">
        {/* LEFT → CASES */}
        <div className="space-y-4">
          <h2 className="font-semibold">Cases & Timing</h2>

          {cases?.length ? (
            cases.map((c) => (
              <div
                key={c.id}
                className="border rounded p-4 flex items-center justify-between"
              >
                <div className="font-medium">{c.title}</div>

                {/* EXISTING PROPOSED TIME */}
                {c.scheduled_at ? (
                  <div className="text-xs space-y-1">
                    <div className="text-slate-600">
                      Proposed: {new Date(c.scheduled_at).toLocaleString()}
                    </div>

                    {(!c.schedule_status || c.schedule_status === "pending") && (
                      <span className="text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded font-semibold">
                        🟡 Waiting response
                      </span>
                    )}

                    {c.schedule_status === "accepted" && (
                      <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded font-semibold">
                        🟢 Accepted by presenter
                      </span>
                    )}

                    {c.schedule_status === "rejected" && (
                      <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded font-semibold">
                        🔴 Rejected by presenter
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    No time proposed yet
                  </div>
                )}

                {/* SESSION TIME INPUTS */}
                <div className="flex gap-2 items-center pt-2">
                  <input
                    type="time"
                    name={`start_${c.id}`}
                    className="border rounded px-2 py-1"
                    required
                  />
                  <span>→</span>
                  <input
                    type="time"
                    name={`end_${c.id}`}
                    className="border rounded px-2 py-1"
                    required
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400 italic">
              No cases selected.
            </div>
          )}
        </div>

        {/* RIGHT → PARTICIPANTS */}
        <div className="space-y-4">
          <h2 className="font-semibold">Participants</h2>

          <div className="border rounded divide-y max-h-[500px] overflow-y-auto">
            {participants?.map((p) => (
              <label
                key={p.user_id}
                className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer"
              >
                <div>
                  <Link
                    href={`/dashboard/Admin/participant/${p.user_id}`}
                    className="font-medium hover:underline"
                  >
                    {p.first_name} {p.last_name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    Age {p.age} • {p.city}
                  </div>
                </div>

                <input
                  type="checkbox"
                  name="participants"
                  value={p.user_id}
                  className="h-4 w-4"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="bg-black text-white px-4 py-2 rounded"
      >
        Create Session & Send Invites
      </button>
    </form>
  );
}
