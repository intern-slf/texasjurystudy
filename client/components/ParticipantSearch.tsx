"use client";

import { useState } from "react";

export default function ParticipantSearch() {
  const [query, setQuery] = useState("");

  function handleSearch(value: string) {
    setQuery(value);
    const container = document.querySelector("[data-participant-list]");
    if (!container) return;
    const items = container.querySelectorAll("[data-participant-name]");
    const q = value.toLowerCase().trim();
    items.forEach((item) => {
      const name = (item as HTMLElement).dataset.participantName?.toLowerCase() ?? "";
      (item as HTMLElement).style.display = !q || name.includes(q) ? "" : "none";
    });
  }

  return (
    <div className="relative">
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
        placeholder="Search participants..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
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
    </div>
  );
}
