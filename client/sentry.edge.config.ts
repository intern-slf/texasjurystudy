import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentryOptions";

// The edge runtime's Sentry (the middleware), loaded by instrumentation.ts.
Sentry.init(sentryOptions);
