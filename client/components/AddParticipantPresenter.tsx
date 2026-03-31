"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  searchParticipantsForCase,
  presenterAddParticipants,
} from "@/lib/actions/presenterParticipant";

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  city?: string;
  date_of_birth?: string;
  political_affiliation?: string;
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

interface Props {
  caseId: string;
  hasSession: boolean;
}

const INITIAL_VISIBLE = 20;

export default function AddParticipantPresenter({ caseId, hasSession }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Debounce
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  async function loadCandidates(query: string) {
    setIsSearching(true);
    try {
      const results = await searchParticipantsForCase(caseId, query);
      setCandidates(results as Candidate[]);
      setVisibleCount(INITIAL_VISIBLE);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setIsSearching(false);
    }
  }

  function onOpen() {
    setIsOpen(true);
    if (!initialLoaded) {
      loadCandidates("");
      setInitialLoaded(true);
    }
  }

  function onSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => loadCandidates(value), 400);
    setDebounceTimer(timer);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleReview() {
    if (!selected.size) return;
    setShowConfirm(true);
  }

  function handleConfirmSend() {
    if (!selected.size) return;
    startTransition(async () => {
      try {
        await presenterAddParticipants(caseId, Array.from(selected));
        setIsOpen(false);
        setSelected(new Set());
        setSearchQuery("");
        setCandidates([]);
        setInitialLoaded(false);
        setShowConfirm(false);
        router.refresh();
      } catch (e: any) {
        alert(e.message || "Failed to add participants");
      }
    });
  }

  function getSelectedCandidates(): Candidate[] {
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    return Array.from(selected)
      .map((id) => candidateMap.get(id))
      .filter(Boolean) as Candidate[];
  }

  function onClose() {
    setIsOpen(false);
    setSearchQuery("");
    setShowConfirm(false);
    setVisibleCount(INITIAL_VISIBLE);
  }

  const visibleList = candidates.slice(0, visibleCount);
  const hasMore = candidates.length > visibleCount;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={!hasSession}
        title={!hasSession ? "A session must be scheduled before adding participants" : ""}
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        Add Participant
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {showConfirm ? (
              <>
                {/* Confirmation Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h2 className="text-lg font-bold">Confirm Invitations</h2>
                  <button type="button" onClick={() => setShowConfirm(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
                </div>

                <div className="px-6 py-3 border-b bg-amber-50">
                  <p className="text-sm text-amber-800">
                    You are about to invite <strong>{selected.size}</strong> participant{selected.size !== 1 ? "s" : ""}. An invitation email will be sent to each.
                  </p>
                </div>

                <div className="overflow-y-auto flex-1 divide-y">
                  {getSelectedCandidates().map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {p.first_name?.[0]}{p.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{p.first_name} {p.last_name}</div>
                        <div className="text-xs text-slate-500">
                          {p.date_of_birth ? `Age ${calcAge(p.date_of_birth)} \u2022 ` : ""}
                          {p.city ?? "N/A"} &bull; {p.political_affiliation ?? "N/A"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-6 py-4 border-t flex justify-between items-center">
                  <button type="button" onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSend}
                    disabled={isPending}
                    className="px-4 py-2 rounded-lg text-sm text-white bg-primary hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
                  >
                    {isPending ? "Sending..." : `Confirm & Send ${selected.size} Invite${selected.size !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <div>
                    <h2 className="text-lg font-bold">Add Participants</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Participants from the follow-up chain are automatically excluded
                    </p>
                  </div>
                  <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchInput(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                  {isSearching && <p className="text-xs text-slate-400 mt-1">Searching...</p>}
                  {!isSearching && candidates.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {candidates.length} eligible participant{candidates.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 divide-y">
                  {visibleList.length === 0 && !isSearching ? (
                    <p className="p-6 text-slate-400 italic text-sm text-center">
                      {searchQuery.trim()
                        ? "No eligible participants found matching your search."
                        : "No eligible participants available."}
                    </p>
                  ) : (
                    <>
                      {visibleList.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="h-4 w-4 rounded border-gray-300 shrink-0 accent-primary"
                          />
                          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {p.first_name?.[0]}{p.last_name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{p.first_name} {p.last_name}</div>
                            <div className="text-xs text-slate-500">
                              {p.date_of_birth ? `Age ${calcAge(p.date_of_birth)} \u2022 ` : ""}
                              {p.city ?? "N/A"} &bull; {p.political_affiliation ?? "N/A"}
                            </div>
                          </div>
                        </label>
                      ))}

                      {hasMore && (
                        <div className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setVisibleCount((prev) => prev + 20)}
                            className="px-4 py-2 rounded text-sm text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                          >
                            Show More ({candidates.length - visibleCount} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex justify-between items-center">
                  <span className="text-xs text-slate-500">{selected.size} selected</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReview}
                      disabled={!selected.size}
                      className="px-4 py-2 rounded-lg text-sm text-white bg-primary hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
                    >
                      Review & Send
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
