"use client";

import { useState, useEffect } from "react";

export default function SelectAllParticipants({ total }: { total: number }) {
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]'
    );
    checkboxes.forEach((cb) => {
      cb.checked = allSelected;
    });
  }, [allSelected]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setAllSelected((prev) => !prev)}
        className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
          allSelected
            ? "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
            : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {allSelected ? "Deselect All" : "Select All"}
      </button>
    </div>
  );
}
