import * as Sentry from "@sentry/nextjs";

// Next.js runs register() once per server instance, before any request.
// It starts Sentry for whichever runtime this is.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

// Errors thrown while rendering a page or running a route or server action.
export const onRequestError = Sentry.captureRequestError;
