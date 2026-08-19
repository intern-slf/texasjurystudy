"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { inviteParticipants, searchEligibleParticipants } from "@/lib/actions/session";
import PriorInvolvementBadge from "@/components/PriorInvolvementBadge";
// Type-only: erased at compile time, so no server module reaches the client bundle.
import type { LineageInvolvement } from "@/lib/case-lineage";

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  city?: string;
  date_of_birth?: string;
  political_affiliation?: string;
  blacklisted?: boolean;
  /** Already used on one of this session's cases or its follow-up chain. */
  lineageBlocked?: boolean;
  /**
   * Invited to this lineage before but never sat on it, so still invitable.
   * Shown as history next to the name; blocking involvements arrive as
   * `lineageBlocked` instead.
   */
  priorInvolvement?: LineageInvolvement | null;
  /** Not an active panel member — `reactivation_status` is not "yes". */
  inactive?: boolean;
  /** Has a profile but no login (no `auth.users` row), so can never be invited. */
  noAccount?: boolean;
  matchLevel?: number;
  filterChecks?: {
    key: string;
    label: string;
    passes: boolean;
    detail: string;
    subRows?: string[];
    subTypes?: { label: string; passes: boolean; subRows: string[] }[];
  }[];
}

interface Props {
  sessionId: string;
  sessionDate: string | null;
  candidates: Candidate[];
}

/* ── Reusable filter-check renderer (mirrors sessions/new) ── */
function FilterChecks({ filterChecks, matchLevel }: { filterChecks: Candidate["filterChecks"]; matchLevel?: number }) {
  if (!filterChecks) return null;

  const isExact = matchLevel === 0;
  const badgeClass = isExact
    ? "bg-green-100 text-green-800 border-green-200 hover:bg-green-200"
    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
  const panelClass = isExact
    ? "bg-green-50 border-green-200"
    : "bg-red-50/50 border-red-100";

  return (
    <details className="inline-block">
      <summary
        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold cursor-pointer select-none list-none transition-colors ${badgeClass}`}
      >
        {isExact ? "Exact Match" : "Mismatch Details"}
      </summary>

      <div className={`mt-1 p-2 border rounded text-[10px] space-y-0.5 ${panelClass}`}>
        {filterChecks.map((fc) => (
          <div
            key={fc.key}
            className={`flex flex-col gap-0.5 ${
              isExact ? (fc.passes ? "" : "text-red-500") : (fc.passes ? "text-green-700" : "text-red-500")
            }`}
          >
            {fc.subTypes ? (
              <details className="w-full">
                <summary className="flex gap-1 items-center cursor-pointer list-none">
                  <span>{fc.passes ? "✓" : "✗"}</span>
                  <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                  <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                </summary>
                <div className="ml-4 mt-1 space-y-1">
                  {fc.subTypes.map((st, si) => (
                    <details key={si} className="w-full">
                      <summary
                        className={`flex gap-1 items-center cursor-pointer list-none text-[9px] ${
                          st.passes ? "text-green-700" : "text-red-500"
                        }`}
                      >
                        <span>{st.passes ? "✓" : "✗"}</span>
                        <span className="font-medium underline decoration-dotted">{st.label}</span>
                        <span className="opacity-60 ml-1">(Click)</span>
                      </summary>
                      <ul className="ml-4 mt-0.5 space-y-0.5 text-[9px] bg-white/50 p-1 rounded border border-black/5 text-slate-700">
                        {st.subRows.map((row, ri) => (
                          <li key={ri}>{row}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>
            ) : fc.subRows ? (
              <details className="w-full">
                <summary className="flex gap-1 items-center cursor-pointer list-none">
                  <span>{fc.passes ? "✓" : "✗"}</span>
                  <span className="font-semibold underline decoration-dotted underline-offset-2">{fc.label}</span>
                  <span className="text-[9px] opacity-70 ml-1">(Click)</span>
                </summary>
                <ul className="ml-4 mt-1 space-y-0.5 text-[9px] bg-white/50 p-1.5 rounded border border-black/5 text-slate-700">
                  {fc.subRows.map((row, i) => (
                    <li key={i}>{row}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <div className="flex gap-1 items-center">
                <span>{fc.passes ? "✓" : "✗"}</span>
                <span className="font-semibold">{fc.label}:</span>
                <span>{fc.detail}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

const INITIAL_VISIBLE = 20;

/** Blacklisted, lineage-blocked, non-active and login-less participants are listed but never selectable. */
function isBlocked(p: Candidate): boolean {
  return Boolean(p.blacklisted || p.lineageBlocked || p.inactive || p.noAccount);
}

function blockReason(p: Candidate): { label: string; title: string; badgeClass: string } {
  if (p.blacklisted) {
    return {
      label: "Blacklisted",
      title: "This participant is blacklisted and cannot be invited.",
      badgeClass: "bg-red-50 text-red-700 border-red-200",
    };
  }
  if (p.noAccount) {
    return {
      label: "No login",
      title:
        "This person has a participant profile but never created a login, so there is no account to invite — they could not open the invitation, complete their profile, or be paid.",
      badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
    };
  }
  if (p.inactive) {
    return {
      label: "Not active",
      title:
        "Not an active panel member — they have not confirmed they are still interested in participating, so they cannot attend a session.",
      badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    };
  }
  return {
    label: "Already used",
    title:
      "Already participated in one of this session's cases or an earlier case in the same follow-up chain — follow-ups must draw fresh participants.",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  };
}


export default function InviteMoreModal({ sessionId, sessionDate, candidates }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Show more state
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Candidate[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Confirmation step
  const [showConfirm, setShowConfirm] = useState(false);

  // Why the last send failed, shown in the modal. Null when there is nothing to report.
  const [sendError, setSendError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleReview() {
    if (!selected.size) return;
    setShowConfirm(true);
  }

  /** Everything rendered so far, so a stale selection can be re-checked against fresh flags. */
  function allKnownCandidates(): Candidate[] {
    return searchResults !== null ? [...candidates, ...searchResults] : candidates;
  }

  function handleConfirmSend() {
    const blocked = new Set(allKnownCandidates().filter(isBlocked).map((c) => c.id));
    const sendIds = Array.from(selected).filter((id) => !blocked.has(id));
    if (!sendIds.length) return;
    setSendError(null);
    startTransition(async () => {
      const result = await inviteParticipants(sessionId, sendIds, sessionDate ?? undefined);

      // Stay open on failure so the reason stays readable and the selection is
      // not silently discarded. Closing the modal on a failed send is what made
      // this look like "the invite worked but no mail arrived".
      if (result && !result.ok) {
        setSendError(result.error ?? "The invites could not be sent.");
        return;
      }

      setIsOpen(false);
      setSelected(new Set());
      setSearchQuery("");
      setSearchResults(null);
      setVisibleCount(INITIAL_VISIBLE);
      setShowConfirm(false);
      router.refresh();
    });
  }

  // Gather selected candidate details for confirmation view
  function getSelectedCandidates(): Candidate[] {
    const uniqueMap = new Map<string, Candidate>();
    for (const c of allKnownCandidates()) uniqueMap.set(c.id, c);
    return Array.from(selected)
      .map((id) => uniqueMap.get(id))
      .filter((c): c is Candidate => Boolean(c) && !isBlocked(c!));
  }

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      setVisibleCount(INITIAL_VISIBLE);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchEligibleParticipants(sessionId, query);
      setSearchResults(results as Candidate[]);
      setVisibleCount(INITIAL_VISIBLE);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  }, [sessionId]);

  // Debounced search
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function onSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => handleSearch(value), 400);
    setDebounceTimer(timer);
  }

  const displayedList = searchResults !== null ? searchResults : candidates;
  const visibleList = displayedList.slice(0, visibleCount);
  const hasMore = displayedList.length > visibleCount;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700"
      >
        Invite More Participants
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">

            {showConfirm ? (
              /* ── Confirmation View ── */
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h2 className="text-lg font-bold">Confirm Invitations</h2>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </div>

                <div className="px-6 py-3 border-b bg-amber-50">
                  <p className="text-sm text-amber-800">
                    You are about to invite <strong>{selected.size}</strong> participant{selected.size !== 1 ? "s" : ""}. An email will be sent to each of them.
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 divide-y">
                  {getSelectedCandidates().map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {p.first_name?.[0]}{p.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {p.first_name} {p.last_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.date_of_birth ? `Age ${calcAge(p.date_of_birth)} \u2022 ` : ""}
                          {p.city ?? "N/A"} &bull; {p.political_affiliation ?? "N/A"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {sendError && (
                  <div className="mx-6 mb-1 mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-semibold text-red-800">
                      The invites were not sent
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-red-700">{sendError}</p>
                    <p className="mt-2 text-xs text-red-600">
                      Your selection has been kept. Fix the cause and press Confirm again.
                    </p>
                  </div>
                )}

                <div className="px-6 py-4 border-t flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSend}
                    disabled={isPending}
                    className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isPending ? "Sending..." : `Confirm & Send ${selected.size} Invite${selected.size !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            ) : (
              /* ── Selection View ── */
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h2 className="text-lg font-bold">Invite More Participants</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setSearchQuery("");
                      setSearchResults(null);
                      setVisibleCount(INITIAL_VISIBLE);
                    }}
                    className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-3 border-b">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchInput(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {isSearching && (
                    <p className="text-xs text-slate-400 mt-1">Searching...</p>
                  )}
                  {searchResults !== null && !isSearching && (
                    <p className="text-xs text-slate-500 mt-1">
                      {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                    </p>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 divide-y">
                  {visibleList.length === 0 ? (
                    <p className="p-6 text-slate-400 italic text-sm text-center">
                      {searchQuery.trim()
                        ? "No participants found matching your search."
                        : "No additional recommended participants found."}
                    </p>
                  ) : (
                    <>
                      {visibleList.map((p) =>
                        isBlocked(p) ? (
                          <div
                            key={p.id}
                            title={blockReason(p).title}
                            className="flex items-center gap-3 px-4 py-3 bg-slate-50 opacity-60 cursor-not-allowed select-none"
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              disabled
                              readOnly
                              className="h-4 w-4 rounded border-gray-300 shrink-0 cursor-not-allowed"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-500 flex items-center gap-2">
                                <span>{p.first_name} {p.last_name}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${blockReason(p).badgeClass}`}
                                >
                                  {blockReason(p).label}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400">
                                {p.date_of_birth ? `Age ${calcAge(p.date_of_birth)} \u2022 ` : ""}
                                {p.city ?? "N/A"} &bull;{" "}
                                {p.political_affiliation ?? "N/A"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label
                            key={p.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => toggle(p.id)}
                              className="h-4 w-4 rounded border-gray-300 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                                <span>{p.first_name} {p.last_name}</span>
                                <PriorInvolvementBadge involvement={p.priorInvolvement} />
                              </div>
                              <div className="text-xs text-slate-500">
                                {p.date_of_birth ? `Age ${calcAge(p.date_of_birth)} \u2022 ` : ""}
                                {p.city ?? "N/A"} &bull;{" "}
                                {p.political_affiliation ?? "N/A"}
                              </div>
                              <div className="mt-1">
                                <FilterChecks filterChecks={p.filterChecks} matchLevel={p.matchLevel} />
                              </div>
                            </div>
                          </label>
                        )
                      )}

                      {/* Show More Button */}
                      {hasMore && (
                        <div className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setVisibleCount((prev) => prev + 20)}
                            className="px-4 py-2 rounded text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
                          >
                            Show More Participants ({displayedList.length - visibleCount} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex justify-between items-center">
                  <span className="text-xs text-slate-500">
                    {selected.size} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        setSearchQuery("");
                        setSearchResults(null);
                        setVisibleCount(INITIAL_VISIBLE);
                      }}
                      className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReview}
                      disabled={!selected.size}
                      className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Send Invites
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </>
  );
}
