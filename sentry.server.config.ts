// Sentry init for the Node.js server runtime (API routes, server components,
// server actions). Loaded via src/instrumentation.ts. Disabled unless a DSN is
// set and we're in production, so local dev never phones home.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && !!dsn,
  // 10% performance tracing; errors are always captured.
  tracesSampleRate: 0.1,
  // Don't attach request bodies / IPs by default (attendee PII, card flows).
  sendDefaultPii: false,
});
