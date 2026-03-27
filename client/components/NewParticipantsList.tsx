"use client";

import { useState, useMemo } from "react";
import VerifyParticipantModal from "@/components/VerifyParticipantModal";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

type Participant = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  entry_date: string | null;
  driver_license_number: string | null;
  idSignedUrl: string | null;
};

export default function NewParticipantsList({
  participants,
}: {
  participants: Participant[];
}) {
  const [selected, setSelected] = useState<Participant | null>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const location = `${p.city ?? ""} ${p.state ?? ""}`.toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      const age = String(p.age ?? "");
      return name.includes(q) || email.includes(q) || location.includes(q) || phone.includes(q) || age.includes(q);
    });
  }, [participants, query]);

  return (
    <>
      {/* ── SEARCH BAR ── */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search by name, email, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm bg-white"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {query && (
        <p className="text-xs text-muted-foreground mb-4">
          {filtered.length === 0
            ? "No participants found."
            : `Showing ${filtered.length} of ${participants.length} participants`}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground italic">
          {query ? `No results for "${query}"` : "No new participants awaiting approval."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.user_id}
              onClick={() => setSelected(p)}
              className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-blue-200 transition-all group cursor-pointer"
            >
              {/* Name */}
              <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                {p.first_name} {p.last_name}
              </h3>

              {/* Email */}
              <p className="text-sm text-slate-500 mt-1 truncate">
                {p.email || "No email"}
              </p>

              {/* Details row */}
              <div className="flex flex-wrap gap-2 mt-3">
                {p.age && (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    Age {p.age}
                  </span>
                )}
                {p.gender && (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full capitalize">
                    {p.gender}
                  </span>
                )}
                {(p.city || p.state) && (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    {[p.city, p.state].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>

              {/* ID badge */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                {p.idSignedUrl ? (
                  <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    🪪 ID Uploaded
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    ⚠ No ID
                  </span>
                )}
              </div>

              {/* Registered date */}
              <p className="text-[10px] text-slate-400 mt-2">
                Registered{" "}
                {p.entry_date
                  ? new Date(p.entry_date).toLocaleDateString()
                  : "—"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* MODAL */}
      {selected && (
        <VerifyParticipantModal
          participant={selected}
          onClose={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
