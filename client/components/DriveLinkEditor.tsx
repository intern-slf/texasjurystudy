"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDriveLink, deleteDriveLink } from "@/app/dashboard/presenter/actions/caseDriveLinks";

type Props = {
  caseId: string;
  /** Legacy single drive_link field — shown as a pre-existing entry if no table rows exist yet */
  initialDriveLink?: string | null;
};

type DriveLink = {
  id: string;
  url: string;
};

const GoogleDriveIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

export default function DriveLinkEditor({ caseId }: Props) {
  const supabase = createClient();
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  async function fetchLinks() {
    const { data } = await supabase
      .from("case_drive_links")
      .select("id, url")
      .eq("case_id", caseId)
      .order("created_at");
    setLinks(data ?? []);
  }

  useEffect(() => {
    fetchLinks();
  }, [caseId]);

  function handleAdd() {
    const url = input.trim();
    if (!url) return;
    startTransition(async () => {
      await addDriveLink(caseId, url);
      setInput("");
      await fetchLinks();
    });
  }

  function handleDelete(linkId: string) {
    if (!confirm("Remove this Drive link?")) return;
    startTransition(async () => {
      await deleteDriveLink(linkId);
      await fetchLinks();
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GoogleDriveIcon />
        <span className="text-sm font-semibold text-slate-800">Google Drive Links</span>
        <span className="text-xs text-slate-400 font-normal">(optional)</span>
      </div>

      {/* Saved links */}
      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 bg-white"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <GoogleDriveIcon />
                <span className="text-sm truncate text-slate-700">{link.url}</span>
              </div>
              <div className="flex gap-3 shrink-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline text-slate-600 hover:text-slate-900"
                >
                  View
                </a>
                <button
                  onClick={() => handleDelete(link.id)}
                  className="text-sm underline text-destructive hover:opacity-80"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add input */}
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="https://drive.google.com/..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!input.trim() || pending}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-500 leading-relaxed">
        <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border border-slate-400 text-slate-400 flex items-center justify-center font-bold text-[9px]">i</span>
        Make sure sharing is set to <strong className="text-slate-700">&ldquo;Anyone with the link can view&rdquo;</strong> in Google Drive.
      </p>
    </div>
  );
}
