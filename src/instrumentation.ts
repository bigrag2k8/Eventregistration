// Next.js instrumentation hook — loads the right Sentry init for each runtime.
// (Sentry's build plugin also auto-injects these imports, so the config files
// must exist.) Requires experimental.instrumentationHook in next.config.mjs,
// which next start reads at runtime — so next.config.mjs must be in the image.
export async function register() {
  // TEMP diagnostic: prove register() ran and what runtime it saw.
  (globalThis as { __instr?: unknown }).__instr = {
    ran: true,
    runtime: process.env.NEXT_RUNTIME ?? null,
  };
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
