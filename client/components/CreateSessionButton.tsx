"use client";

import { useFormStatus } from "react-dom";

export default function CreateSessionButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 ${
        pending
          ? "bg-gray-400 cursor-not-allowed opacity-80"
          : "bg-black hover:bg-gray-800 active:scale-95"
      }`}
    >
      {pending ? (
        <>
          {/* Spinner */}
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
        "Create Session & Send Invites"
      )}
    </button>
  );
}
