/**
 * What every Sentry runtime (server, edge, browser) shares. Sentry reports
 * errors to sentry.io and emails us about new ones; see instrumentation.ts.
 *
 * Off until NEXT_PUBLIC_SENTRY_DSN is set (Sentry.init with no DSN does
 * nothing), so local dev and CI send nothing.
 *
 * Errors only: no performance tracing and no session replay, which would
 * record what firms and participants type. sendDefaultPii stays off, so no
 * IP addresses, cookies or auth headers are sent.
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "development",
  sendDefaultPii: false,
  tracesSampleRate: 0,
};
