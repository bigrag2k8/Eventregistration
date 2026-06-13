/**
 * Sentry init for the standalone background worker.
 *
 * The worker runs outside Next.js (`tsx src/server/worker.ts`), so the Next
 * instrumentation hook never covers it. This uses @sentry/node directly and
 * MUST be imported before anything else in worker.ts so the SDK's global
 * uncaughtException / unhandledRejection handlers register first.
 *
 * Reads NEXT_PUBLIC_SENTRY_DSN (the var already set on the web service; the
 * DSN is public) and falls back to SENTRY_DSN. Disabled when no DSN is set, so
 * a worker without the var configured simply doesn't send — no crash.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV ?? "production",
  // Tag so worker events are easy to separate from web events in Sentry.
  initialScope: { tags: { service: "worker" } },
});

export { Sentry };
