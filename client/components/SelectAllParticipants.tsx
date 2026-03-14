"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SelectAllParticipants({
  total,
  isOldData = false,
}: {
  total?: number;
  isOldData?: boolean;
}) {
  const [allSelected, setAllSelected] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]'
    );
    checkboxes.forEach((cb) => {
      cb.checked = allSelected;
    });
  }, [allSelected]);

  async function handleDownloadCSV() {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]'
    );
    const selectedIds: string[] = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) selectedIds.push(cb.value);
    });

    if (selectedIds.length === 0) {
      alert("No participants selected.");
      return;
    }

    setDownloading(true);
    try {
      const supabase = createClient();

      let emails: string[] = [];

      if (isOldData) {
        // pId in the page is `p.user_id || p.id`, so try user_id first, fallback to id
        let { data, error } = await supabase
          .from("oldData")
          .select("email")
          .in("user_id", selectedIds);
        if (!error && (!data || data.length === 0)) {
          const res = await supabase
            .from("oldData")
            .select("email")
            .in("id", selectedIds);
          data = res.data;
          error = res.error;
        }
        console.log("[CSV] oldData query →", { selectedIds, data, error });
        if (error) throw error;
        emails = (data ?? []).map((row: { email: string }) => row.email).filter(Boolean);
      } else {
        const { data, error } = await supabase
          .from("jury_participants")
          .select("email")
          .in("user_id", selectedIds);
        if (error) throw error;
        emails = (data ?? []).map((row: { email: string }) => row.email).filter(Boolean);
      }

      const csv = "email\n" + emails.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selected_participants.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to download CSV.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleDownloadCSV}
        disabled={downloading}
        className="px-3 py-1.5 rounded text-xs font-semibold border transition-colors bg-blue-600 border-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {downloading ? "Downloading..." : "Download as CSV"}
      </button>
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
