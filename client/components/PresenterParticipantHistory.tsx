"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ChainParticipant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  invite_status: string;
}

interface ChainNode {
  id: string;
  title: string;
  status: string;
  admin_status: string;
  created_at: string;
  parent_case_id: string | null;
  participants: ChainParticipant[];
}

interface Props {
  caseId: string;
  currentCaseId: string;
}

export default function PresenterParticipantHistory({ caseId, currentCaseId }: Props) {
  const [chain, setChain] = useState<ChainNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchChain();
  }, [caseId]);

  async function fetchChain() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Walk up to root
      const ancestors: string[] = [];
      let currentId: string | null = caseId;
      while (currentId) {
        const result: { data: { parent_case_id: string | null } | null } = await supabase
          .from("cases")
          .select("parent_case_id")
          .eq("id", currentId)
          .single();

        const parentCaseId = result.data?.parent_case_id ?? null;
        if (!parentCaseId) break;
        ancestors.push(parentCaseId);
        currentId = parentCaseId;
        if (ancestors.length > 20) break;
      }

      const rootId = ancestors.length > 0 ? ancestors[ancestors.length - 1] : caseId;

      // Walk down from root to get all descendants
      const allIds: string[] = [rootId];
      const queue = [rootId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const { data: children } = await supabase
          .from("cases")
          .select("id")
          .eq("parent_case_id", id)
          .is("deleted_at", null);

        for (const child of children ?? []) {
          allIds.push(child.id);
          queue.push(child.id);
        }
        if (allIds.length > 50) break;
      }

      // Fetch case details
      const { data: cases } = await supabase
        .from("cases")
        .select("id, title, status, admin_status, created_at, parent_case_id")
        .in("id", allIds);

      if (!cases?.length) {
        setChain([]);
        setLoading(false);
        return;
      }

      // Fetch session-participant mapping
      const { data: sessionCases } = await supabase
        .from("session_cases")
        .select("case_id, session_id")
        .in("case_id", allIds);

      const sessionIds = [...new Set((sessionCases ?? []).map((sc) => sc.session_id))];

      let participantsBySession: Record<string, { participant_id: string; invite_status: string }[]> = {};
      if (sessionIds.length > 0) {
        const { data: sp } = await supabase
          .from("session_participants")
          .select("session_id, participant_id, invite_status")
          .in("session_id", sessionIds);

        for (const row of sp ?? []) {
          if (!participantsBySession[row.session_id]) participantsBySession[row.session_id] = [];
          participantsBySession[row.session_id].push(row);
        }
      }

      const caseSessionMap: Record<string, string[]> = {};
      for (const sc of sessionCases ?? []) {
        if (!caseSessionMap[sc.case_id]) caseSessionMap[sc.case_id] = [];
        caseSessionMap[sc.case_id].push(sc.session_id);
      }

      // Fetch participant details
      const allPIds = new Set<string>();
      for (const sessions of Object.values(participantsBySession)) {
        for (const p of sessions) allPIds.add(p.participant_id);
      }

      let detailsMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
      const pIds = Array.from(allPIds);
      if (pIds.length > 0) {
        const { data: juryData } = await supabase
          .from("jury_participants")
          .select("user_id, first_name, last_name, email")
          .in("user_id", pIds);

        for (const jd of juryData ?? []) {
          detailsMap[jd.user_id] = jd;
        }

        const missing = pIds.filter((id) => !detailsMap[id]);
        if (missing.length > 0) {
          const { data: oldData } = await supabase
            .from("oldData")
            .select("id, first_name, last_name, email")
            .in("id", missing);

          for (const od of oldData ?? []) {
            detailsMap[od.id] = { first_name: od.first_name, last_name: od.last_name, email: od.email };
          }
        }
      }

      // Build nodes
      const nodes: ChainNode[] = cases.map((c) => {
        const caseSessions = caseSessionMap[c.id] ?? [];
        const participants: ChainParticipant[] = [];
        const seenPIds = new Set<string>();

        for (const sid of caseSessions) {
          for (const sp of participantsBySession[sid] ?? []) {
            if (seenPIds.has(sp.participant_id)) continue;
            seenPIds.add(sp.participant_id);
            const d = detailsMap[sp.participant_id];
            participants.push({
              id: sp.participant_id,
              first_name: d?.first_name ?? "Unknown",
              last_name: d?.last_name ?? "",
              email: d?.email ?? "",
              invite_status: sp.invite_status,
            });
          }
        }

        return {
          id: c.id,
          title: c.title,
          status: c.status,
          admin_status: c.admin_status,
          created_at: c.created_at,
          parent_case_id: c.parent_case_id,
          participants,
        };
      });

      // Order: root first via parent_case_id chain
      const childMap: Record<string, string[]> = {};
      for (const n of nodes) {
        const p = n.parent_case_id;
        if (p && allIds.includes(p)) {
          if (!childMap[p]) childMap[p] = [];
          childMap[p].push(n.id);
        }
      }

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const ordered: ChainNode[] = [];
      const bfs = [rootId];
      const visited = new Set<string>();
      while (bfs.length > 0) {
        const id = bfs.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodeMap.get(id);
        if (node) ordered.push(node);
        const children = (childMap[id] ?? []).sort((a, b) => {
          const na = nodeMap.get(a);
          const nb = nodeMap.get(b);
          return (na?.created_at ?? "").localeCompare(nb?.created_at ?? "");
        });
        bfs.push(...children);
      }

      setChain(ordered);
    } catch (e) {
      console.error("Failed to fetch case chain:", e);
      setChain([]);
    }
    setLoading(false);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="py-4 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading follow-up chain...
        </div>
      </div>
    );
  }

  if (chain.length === 0) return null;

  const statusBadge = (node: ChainNode) => {
    if (node.status === "previous") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">Past</span>;
    if (node.admin_status === "approved" || node.admin_status === "submitted") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">Approved</span>;
    if (node.admin_status === "rejected") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Rejected</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Pending</span>;
  };

  const inviteStatusBadge = (status: string) => {
    if (status === "accepted") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">Accepted</span>;
    if (status === "declined") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">Declined</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Pending</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {chain.length > 1 ? `Case Lineage (${chain.length} cases)` : `Case (1)`}
        </span>
      </div>

      <div className="relative">
        {chain.map((node, idx) => {
          const isCurrent = node.id === currentCaseId;
          const isExpanded = expanded.has(node.id);
          const isLast = idx === chain.length - 1;

          return (
            <div key={node.id} className="relative flex gap-3">
              {/* Vertical connector line */}
              <div className="flex flex-col items-center w-6 shrink-0">
                <div
                  className={`w-3 h-3 rounded-full border-2 mt-1 shrink-0 ${
                    isCurrent
                      ? "bg-primary border-primary"
                      : "bg-white border-slate-300"
                  }`}
                />
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />
                )}
              </div>

              {/* Node content */}
              <div className={`flex-1 pb-4 ${isLast ? "" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isCurrent
                      ? "border-primary/30 bg-primary/5"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm font-semibold truncate ${isCurrent ? "text-primary" : ""}`}>
                        {node.title}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium shrink-0">
                          Current
                        </span>
                      )}
                      {statusBadge(node)}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {node.participants.length} participant{node.participants.length !== 1 ? "s" : ""}
                      </span>
                      <span className={`text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(node.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </button>

                {/* Expanded participant list */}
                {isExpanded && node.participants.length > 0 && (
                  <div className="mt-2 ml-1 border border-slate-100 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Participants
                      </span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {node.participants.map((p) => (
                        <Link
                          key={p.id}
                          href={`/dashboard/participant/${p.id}?from=case&caseId=${node.id}`}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {p.first_name?.[0]}{p.last_name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium hover:underline">
                              {p.first_name} {p.last_name}
                            </span>
                          </div>
                          {inviteStatusBadge(p.invite_status)}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && node.participants.length === 0 && (
                  <p className="mt-2 ml-1 text-xs text-muted-foreground italic">
                    No participants invited yet
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
