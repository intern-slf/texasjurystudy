"use client";

import { useEffect, useState } from "react";

/**
 * Reports the delivery-mode makeup of the "Build Session" case selection.
 *
 * A session cannot hold both in-person and online cases — one venue, one set of
 * joining instructions, one participant pay rate. That is enforced in
 * addCasesToSession / replaceCaseInSession, again by the
 * session_cases_single_delivery_mode trigger, and surfaced as a blocking screen
 * with one-click "continue with just these" links on /sessions/new.
 *
 * This component is deliberately READ-ONLY. An earlier version disabled the
 * other format's checkboxes, which was worse in two ways:
 *
 *   1. A disabled checkbox is not submitted. Any already-ticked box that then
 *      got disabled — e.g. when the browser restored a mixed selection on a back
 *      navigation, which the mount-time sync exists to catch — was silently
 *      dropped from the query string. The admin built a session from fewer cases
 *      than they picked, with no error shown, and the blocking screen became
 *      unreachable because the offending id never left the browser.
 *   2. Nothing re-ran when a row left the table. Ticking a case and then
 *      unapproving it left every other-format checkbox disabled with no ticked
 *      box left to clear it, recoverable only by a full reload.
 *
 * Warning and letting the submit through is strictly better: nothing is silently
 * dropped, and the server already answers a mixed selection with a screen that
 * splits it in one click.
 */
export default function CaseModeSelectionGuard() {
  const [counts, setCounts] = useState({ online: 0, offline: 0 });

  useEffect(() => {
    const read = () =>
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"][name="selectedCases"][data-delivery-mode]',
        ),
      );

    const sync = () => {
      const checked = read().filter((b) => b.checked);
      const offline = checked.filter((b) => b.dataset.deliveryMode === "offline").length;
      const online = checked.length - offline;
      // Returning `prev` unchanged makes React bail out of the re-render. That
      // matters: this component's own output lives inside the subtree the
      // observer below watches, so always allocating a new object would loop.
      setCounts((prev) =>
        prev.online === online && prev.offline === offline ? prev : { online, offline },
      );
    };

    // Delegated, so it survives the table re-rendering.
    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.name === "selectedCases") sync();
    };
    document.addEventListener("change", onChange);

    // Rows appear and disappear on approve / unapprove without firing a change
    // event, which would otherwise leave a stale count on screen. Safe to be
    // noisy: sync only reads, and equal counts re-render nothing.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    sync(); // a selection the browser restored on a back navigation

    return () => {
      document.removeEventListener("change", onChange);
      observer.disconnect();
    };
  }, []);

  const { online, offline } = counts;
  const total = online + offline;
  if (total === 0) return null;

  if (online > 0 && offline > 0) {
    return (
      <p className="max-w-xs text-right text-xs font-medium text-red-600">
        {offline} in-person and {online} online case{online === 1 ? "" : "s"} selected — these
        cannot share a session. Build Session will offer to split them.
      </p>
    );
  }

  return (
    <p className="text-xs text-slate-500">
      Building an{" "}
      <span className="font-semibold">{offline > 0 ? "in-person" : "online"}</span> session (
      {total} case{total === 1 ? "" : "s"}).
    </p>
  );
}
