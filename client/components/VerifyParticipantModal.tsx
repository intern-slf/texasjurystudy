"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { verifyParticipant, blacklistParticipant } from "@/lib/actions/adminParticipant";

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

export default function VerifyParticipantModal({
  participant,
  onClose,
}: {
  participant: Participant;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"default" | "blacklist">("default");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Zoom state
  const [isZooming, setIsZooming] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");

  const p = participant;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  async function handleVerify() {
    setLoading(true);
    await verifyParticipant(p.user_id);
    onClose();
  }

  async function handleBlacklist() {
    if (!reason.trim()) return;
    setLoading(true);
    await blacklistParticipant(p.user_id, reason.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
        >
          ✕
        </button>

        <div className="flex flex-col md:flex-row">
          {/* ====== LEFT: ID IMAGE with cursor zoom ====== */}
          <div className="md:w-1/2 bg-slate-50 border-r flex flex-col items-center justify-center p-6 min-h-[300px]">
            {p.idSignedUrl ? (
              <>
                <div
                  className="overflow-hidden rounded-lg shadow-sm cursor-crosshair"
                  onMouseEnter={() => setIsZooming(true)}
                  onMouseLeave={() => setIsZooming(false)}
                  onMouseMove={handleMouseMove}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.idSignedUrl}
                    alt="Driver's License / ID"
                    className="max-h-[400px] max-w-full object-contain transition-transform duration-150 ease-out"
                    style={{
                      transform: isZooming ? "scale(5)" : "scale(1)",
                      transformOrigin: origin,
                    }}
                  />
                </div>
                <span className="mt-2 text-[10px] text-slate-400 font-medium">
                  Hover to zoom · 5×
                </span>
              </>
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-5xl mb-3">🪪</div>
                <p className="text-sm font-medium">No ID uploaded</p>
              </div>
            )}
          </div>


          {/* ====== RIGHT: DETAILS ====== */}
          <div className="md:w-1/2 p-6 flex flex-col">
            {/* HEADER */}
            <div className="mb-5">
              <h3 className="text-xl font-bold text-slate-900">
                <Link
                  href={`/dashboard/participant/${p.user_id}`}
                  className="hover:text-blue-600 hover:underline transition-colors"
                >
                  {p.first_name} {p.last_name}
                </Link>
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Registered{" "}
                {p.entry_date
                  ? new Date(p.entry_date).toLocaleDateString()
                  : "—"}
              </p>
            </div>

            {/* DETAILS GRID */}
            <div className="space-y-3 flex-1 text-sm">
              <DetailRow label="Email" value={p.email} />
              <DetailRow label="Phone" value={p.phone} />
              <DetailRow label="Age" value={p.age?.toString()} />
              <DetailRow label="Gender" value={p.gender} />
              <DetailRow
                label="Location"
                value={[p.city, p.state].filter(Boolean).join(", ")}
              />
              <DetailRow label="DL / ID #" value={p.driver_license_number} />
            </div>

            {/* ====== ACTIONS ====== */}
            <div className="mt-6 pt-4 border-t">
              {mode === "default" ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleVerify}
                    disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors text-sm"
                  >
                    {loading ? "Verifying…" : "✓ Verify"}
                  </button>
                  <button
                    onClick={() => setMode("blacklist")}
                    disabled={loading}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors text-sm"
                  >
                    ✕ Blacklist
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Reason for blacklisting
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter reason…"
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleBlacklist}
                      disabled={loading || !reason.trim()}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-colors text-sm"
                    >
                      {loading ? "Processing…" : "Confirm Blacklist"}
                    </button>
                    <button
                      onClick={() => {
                        setMode("default");
                        setReason("");
                      }}
                      disabled={loading}
                      className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="text-slate-900 font-semibold text-right max-w-[60%] truncate">
        {value || "—"}
      </span>
    </div>
  );
}
