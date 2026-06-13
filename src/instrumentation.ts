// Next.js instrumentation hook — loads the right Sentry init for each runtime.
// (Sentry's build plugin also auto-injects these imports, so the config files
// must exist.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
