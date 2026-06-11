"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for the reactivation-email confirm form.
 *
 * Uses useFormStatus so the button disables itself the instant the server
 * action starts and stays disabled until the redirect. This is the front-line
 * guard against double-submits: the send action can take tens of seconds, and
 * without this the spinner looks hung and admins click "Send" repeatedly,
 * re-emailing everyone. (The action also has a server-side cooldown as a
 * second line of defence.)
 */
export default function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={count === 0 || pending}
      aria-busy={pending}
      className="inline-flex items-center rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Sending…" : `Confirm and Send (${count})`}
    </button>
  );
}
