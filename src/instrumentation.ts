// Next.js instrumentation hook — loads the right Sentry init for each runtime.
// (Sentry's build plugin also auto-injects these imports, so the config files
// must exist.) Requires experimental.instrumentationHook in next.config.mjs,
// which `next start` reads at runtime — so next.config.mjs must be in the
// runtime image (see Dockerfile runner stage).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
