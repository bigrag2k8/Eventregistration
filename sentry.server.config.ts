import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// TEMP diagnostic: record that this module actually executed and what DSN it saw
// at init time (the value baked in at build for this bundle).
(globalThis as { __sentryServerConfig?: unknown }).__sentryServerConfig = {
  loaded: true,
  dsnPresent: !!dsn,
};

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
