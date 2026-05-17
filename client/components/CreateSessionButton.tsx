"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

interface SelectedItem {
  id: string;
  name: string;
}

function ConfirmSubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold text-white transition-all duration-200 ${
        pending
          ? "bg-gray-400 cursor-not-allowed opacity-80"
          : "bg-blue-600 hover:bg-blue-700 active:scale-95"
      }`}
    >
      {pending ? (
        <>
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Creating...
        </>
      ) : (
        `Confirm & Create Session (${count} invite${count !== 1 ? "s" : ""})`
      )}
    </button>
  );
}

export default function CreateSessionButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  function handleReview() {
    const dateInput = document.querySelector<HTMLInputElement>(
      'input[name="session_date"]'
    );
    if (!dateInput?.value) {
      alert("Please select a session date first.");
      return;
    }

    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]:checked'
    );
    const items: SelectedItem[] = [];
    checkboxes.forEach((cb) => {
      const row = cb.closest<HTMLElement>("[data-participant-name]");
      const name = row?.dataset.participantName || "Unknown";
      items.push({ id: cb.value, name });
    });

    if (items.length === 0) {
      const ok = window.confirm(
        "No participants selected. Create the session anyway?"
      );
      if (!ok) return;
    }

    setSelected(items);
    setShowConfirm(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleReview}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-black hover:bg-gray-800 active:scale-95 transition-all duration-200"
      >
        Create Session & Send Invites
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Confirm Session Creation</h2>
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
                You are about to create a session and invite{" "}
                <strong>{selected.length}</strong> participant
                {selected.length !== 1 ? "s" : ""}. An email will be sent to
                each of them.
              </p>
            </div>

            <div className="overflow-y-auto flex-1 divide-y">
              {selected.length === 0 ? (
                <p className="p-6 text-slate-400 italic text-sm text-center">
                  No participants selected.
                </p>
              ) : (
                selected.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {p.name
                        .split(" ")
                        .map((s) => s[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="font-medium text-sm">{p.name}</div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-between items-center">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                &larr; Back
              </button>
              <ConfirmSubmitButton count={selected.length} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
