"use client";

import { useState } from "react";
import VerifyParticipantModal from "@/components/VerifyParticipantModal";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  return (
    <>
      {participants.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground italic">
          No new participants awaiting approval.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((p) => (
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
