"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  invite_status: string;
}

interface Props {
  caseId: string;
}

export default function CaseParticipantSummary({ caseId }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchParticipants();
  }, [caseId]);

  async function fetchParticipants() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get session IDs for this case
      const { data: sessionCases } = await supabase
        .from("session_cases")
        .select("session_id")
        .eq("case_id", caseId);

      if (!sessionCases?.length) {
        setParticipants([]);
        setLoading(false);
        return;
      }

      const sessionIds = sessionCases.map((sc) => sc.session_id);

      // Get participants from those sessions
      const { data: sp } = await supabase
        .from("session_participants")
        .select("participant_id, invite_status")
        .in("session_id", sessionIds);

      if (!sp?.length) {
        setParticipants([]);
        setLoading(false);
        return;
      }

      // Deduplicate
      const uniqueMap = new Map<string, { participant_id: string; invite_status: string }>();
      for (const row of sp) {
        if (!uniqueMap.has(row.participant_id)) {
          uniqueMap.set(row.participant_id, row);
        }
      }

      const pIds = Array.from(uniqueMap.keys());

      // Fetch details
      const { data: juryData } = await supabase
        .from("jury_participants")
        .select("user_id, first_name, last_name")
        .in("user_id", pIds);

      let detailsMap: Record<string, { first_name: string; last_name: string }> = {};
      for (const jd of juryData ?? []) {
        detailsMap[jd.user_id] = jd;
      }

      const missing = pIds.filter((id) => !detailsMap[id]);
      if (missing.length > 0) {
        const { data: oldData } = await supabase
          .from("oldData")
          .select("id, first_name, last_name")
          .in("id", missing);
        for (const od of oldData ?? []) {
          detailsMap[od.id] = { first_name: od.first_name, last_name: od.last_name };
        }
      }

      const result: Participant[] = pIds.map((id) => ({
        id,
        first_name: detailsMap[id]?.first_name ?? "Unknown",
        last_name: detailsMap[id]?.last_name ?? "",
        invite_status: uniqueMap.get(id)?.invite_status ?? "pending",
      }));

      setParticipants(result);
    } catch (e) {
      console.error("Failed to load participants:", e);
    }
    setLoading(false);
  }

  if (loading) {
    return <span className="text-xs text-muted-foreground">Loading participants...</span>;
  }

  if (participants.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No participants recorded</span>;
  }

  const accepted = participants.filter((p) => p.invite_status === "accepted").length;
  const declined = participants.filter((p) => p.invite_status === "declined").length;
  const pending = participants.filter((p) => p.invite_status !== "accepted" && p.invite_status !== "declined").length;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-primary transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{participants.length} participant{participants.length !== 1 ? "s" : ""}</span>
        <span className="text-[10px] text-muted-foreground">
          ({accepted} accepted{declined > 0 ? `, ${declined} declined` : ""}{pending > 0 ? `, ${pending} pending` : ""})
        </span>
        <span className={`text-[10px] transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>

      {expanded && (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="divide-y divide-slate-50">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                <div className="h-5 w-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {p.first_name?.[0]}{p.last_name?.[0]}
                </div>
                <span className="text-xs flex-1">{p.first_name} {p.last_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  p.invite_status === "accepted"
                    ? "bg-green-50 text-green-700"
                    : p.invite_status === "declined"
                    ? "bg-red-50 text-red-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {p.invite_status === "accepted" ? "Accepted" : p.invite_status === "declined" ? "Declined" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
