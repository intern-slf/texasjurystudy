const STORAGE_KEY = "tjs:last-visited";

/**
 * Pages that are never worth returning to. The marketing pages (including the
 * role-specific "Home" targets) are what the account icon is meant to rescue
 * the user *from*, so landing on one must not overwrite the remembered page.
 */
const UNTRACKED_ROUTES = [
  "/",
  "/participants",
  "/requestee",
  "/privacy",
  "/terms",
  "/contact",
];

/** Prefixes that are untracked for their entire subtree. */
const UNTRACKED_PREFIXES = ["/auth", "/login", "/api/"];

/** True for the signed-in app pages worth sending a returning user back to. */
export function isTrackablePath(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;
  if (UNTRACKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return !UNTRACKED_ROUTES.includes(pathname);
}

/** Records the page the account icon should return to. No-op off-screen. */
export function rememberVisit(pathname: string): void {
  if (typeof window === "undefined" || !isTrackablePath(pathname)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pathname);
  } catch {
    // Storage can be unavailable (private mode, quota) — remembering the page
    // is a convenience, never a reason to break navigation.
  }
}

/** The remembered page, or null when there is nothing safe to return to. */
export function readLastVisited(): string | null {
  if (typeof window === "undefined") return null;

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  // Re-validated on the way out: the value is user-writable, so a tampered
  // "//evil.com" must never become a redirect target.
  if (!stored || !isTrackablePath(stored)) return null;
  return stored;
}

export function clearLastVisited(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See rememberVisit.
  }
}
