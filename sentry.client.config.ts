// Sentry init for the browser. Auto-injected into the client bundle by
// withSentryConfig. The DSN is public (safe to expose), hence NEXT_PUBLIC_*.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && !!dsn,
  tracesSampleRate: 0.1,
  // Session Replay off for now (keeps the bundle light); can enable later.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
