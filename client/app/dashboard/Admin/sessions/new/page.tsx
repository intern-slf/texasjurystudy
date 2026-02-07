import { createClient } from "@/lib/supabase/server";
import {
  createSession,
  addCasesToSession,
  inviteParticipants,
} from "@/lib/actions/session";
import Link from "next/link";

/* =========================
   PAGE
========================= */

export default async function NewSessionPage() {
  const supabase = await createClient();

  // Approved cases
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("admin_status", "approved")
    .order("created_at", { ascending: false });

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

    // 1️⃣ create session
    const sessionId = await createSession(date);

    // timings
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

    // ✔ NEW → selected from checkboxes
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
      <h1 className="text-2xl font-bold">Create Session</h1>
      {/* Date */}
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

                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    name={`start_${c.id}`}
                    className="border rounded px-2 py-1"
                  />
                  <span>→</span>
                  <input
                    type="time"
                    name={`end_${c.id}`}
                    className="border rounded px-2 py-1"
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-400 italic">
              No approved cases.
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
