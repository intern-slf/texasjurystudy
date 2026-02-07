import { createClient } from "@/lib/supabase/server";
import {
  createSession,
  addCasesToSession,
  inviteParticipants,
} from "@/lib/actions/session";

/* =========================
   PAGE
========================= */

export default async function NewSessionPage() {
  const supabase = await createClient();

  // fetch only approved cases
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("admin_status", "approved")
    .order("created_at", { ascending: false });

  /* =========================
     SERVER ACTION
  ========================= */

  async function handleCreate(formData: FormData) {
    "use server";

    const date = formData.get("session_date") as string;

    if (!date) throw new Error("Session date required");

    // 1️⃣ create session
    const sessionId = await createSession(date);

    // 2️⃣ collect case timings
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

    // 3️⃣ participants (TEMP → replace with real selection later)
    const participants = (formData.get("participants") as string)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (participants?.length) {
      await inviteParticipants(sessionId, participants);
    }
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Create Session</h1>

      <form action={handleCreate} className="space-y-8">
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

        {/* Cases */}
        <div className="space-y-4">
          <h2 className="font-semibold">Approved Cases</h2>

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

        {/* Participants (temporary) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Participant IDs (comma separated)
          </label>
          <input
            type="text"
            name="participants"
            placeholder="uuid, uuid, uuid"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="bg-black text-white px-4 py-2 rounded"
        >
          Create Session & Send Invites
        </button>
      </form>
    </div>
  );
}
