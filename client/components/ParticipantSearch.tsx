"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface SearchResult {
  id: string;
  user_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  city?: string;
  date_of_birth?: string;
  political_affiliation?: string;
}

export default function ParticipantSearch({ testTable, isOldData }: { testTable: string; isOldData: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      // Show all server-rendered items
      const container = document.querySelector("[data-participant-list]");
      if (container) {
        container.querySelectorAll("[data-participant-name]").forEach((item) => {
          (item as HTMLElement).style.display = "";
        });
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const q = value.trim();

      const { data } = await supabase
        .from(testTable)
        .select("id, user_id, first_name, last_name, email, city, date_of_birth, political_affiliation")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(50);

      setResults(data ?? []);
      setSearching(false);
      setShowResults(true);
    }, 300);
  }

  function getAge(dob: string) {
    const b = new Date(dob);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    return a;
  }

  function selectParticipant(p: SearchResult) {
    const pId = p.user_id || p.id;
    // Check if checkbox already exists for this participant
    const existing = document.querySelector<HTMLInputElement>(`input[name="participants"][value="${pId}"]`);
    if (existing) {
      existing.checked = true;
      existing.closest("[data-participant-name]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // Add a hidden checked checkbox so it's included in form submission
      const container = document.querySelector("[data-participant-list]");
      if (container) {
        const wrapper = document.createElement("div");
        wrapper.className = "flex items-center justify-between p-3 bg-blue-50 border-b";
        wrapper.setAttribute("data-participant-name", `${p.first_name} ${p.last_name}`);
        wrapper.innerHTML = `
          <div class="flex-1 min-w-0">
            <a href="/dashboard/participant/${p.id}${isOldData ? "?test_table=oldData" : ""}" target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 hover:underline">
              ${p.first_name} ${p.last_name}
            </a>
            <div class="text-xs text-slate-500 mt-1">
              ${p.date_of_birth ? `Age ${getAge(p.date_of_birth)} \u2022 ` : ""}${p.city || ""} \u2022 ${p.political_affiliation ?? "N/A"}
            </div>
            <div class="mt-1">
              <span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 text-[10px] font-semibold">Added via Search</span>
            </div>
          </div>
          <label class="cursor-pointer p-1">
            <input type="checkbox" name="participants" value="${pId}" checked class="h-4 w-4 ml-2 flex-shrink-0" />
          </label>
        `;
        container.prepend(wrapper);
      }
    }
    setQuery("");
    setResults([]);
    setShowResults(false);
  }

  return (
    <div className="relative" ref={ref}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        placeholder="Search by name or email..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowResults(true); }}
        className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
      />
      {query && (
        <button
          type="button"
          onClick={() => handleSearch("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      {/* Search results dropdown */}
      {showResults && query && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {searching ? (
            <div className="p-3 text-sm text-slate-400 text-center">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-slate-400 text-center">No participants found</div>
          ) : (
            results.map((p) => {
              const pId = p.user_id || p.id;
              return (
                <button
                  key={pId}
                  type="button"
                  onClick={() => selectParticipant(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-sm">{p.first_name} {p.last_name}</div>
                  {p.email && <div className="text-xs text-slate-400">{p.email}</div>}
                  <div className="text-xs text-slate-500">
                    {p.date_of_birth ? `Age ${getAge(p.date_of_birth)} \u2022 ` : ""}
                    {p.city || ""} {p.political_affiliation ? `\u2022 ${p.political_affiliation}` : ""}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
