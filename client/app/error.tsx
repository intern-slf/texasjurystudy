"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Without this, any thrown server error renders Next's bare "Application error:
 * a server-side exception has occurred" page with only a digest — no way for an
 * admin to recover and nothing useful to report.
 *
 * The Reload button matters more than it looks. The most common cause of a
 * server-action POST failing on this app is deployment skew: Next hashes server
 * action ids per build, so a tab left open across a deploy posts an id the live
 * deployment no longer has, and the request 500s before the action runs. A hard
 * reload fetches the current bundle and fixes it. `reset()` alone does not — it
 * re-renders the same stale client bundle — so this does a real reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console and in Vercel's client logs, so the digest
    // shown to the user can be tied to a message.
    console.error("[error boundary]", error.digest, error.message, error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600 ring-1 ring-red-200">
        !
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        This page hit a server error. If you had this tab open while the site was
        updated, reloading is usually all it takes — the button below fetches the
        latest version.
      </p>

      <div className="mt-7 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Reload page
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Try again
        </button>
      </div>

      {error.digest && (
        <p className="mt-8 font-mono text-xs text-slate-400">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}