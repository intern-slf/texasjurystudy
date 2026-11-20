import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentryOptions";

// The server's Sentry, loaded by instrumentation.ts.
//
// The app catches most failures itself and logs them with console.error
// ("[stripe-webhook] … failed", "[health] mailer check failed") rather than
// throwing, so those would never reach Sentry as crashes. captureConsole turns
// each console.error into a Sentry event, so a failing webhook, mailer or
// database write is reported like any crash.
Sentry.init({
  ...sentryOptions,
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
