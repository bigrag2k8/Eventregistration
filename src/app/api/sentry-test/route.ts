import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

/**
 * TEMPORARY: verifies the server→Sentry pipe. Reports whether instrumentation
 * initialized Sentry, and if not, inits inline to isolate whether the DSN works.
 * Token-gated; remove once delivery is confirmed.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (key !== "verify-sentry-3f9c7a21") {
    return new NextResponse("Not found", { status: 404 });
  }

  const clientFromInstrumentation = !!Sentry.getClient();
  const serverConfigDiag =
    (globalThis as { __sentryServerConfig?: unknown }).__sentryServerConfig ?? null;
  const instrDiag = (globalThis as { __instr?: unknown }).__instr ?? null;

  // If the instrumentation hook didn't init Sentry, init it right here so we can
  // tell whether the DSN itself is valid (vs. only the hook being broken).
  if (!clientFromInstrumentation && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, enabled: true });
  }

  const eventId = Sentry.captureException(new Error("Sentry pipe verification — safe to ignore"));
  const flushed = await Sentry.flush(4000);

  const client = Sentry.getClient();
  const dsn = client?.getDsn();
  return NextResponse.json({
    clientFromInstrumentation,            // false => the instrumentation hook didn't init Sentry
    instrDiag,                            // null => register() never ran (instrumentationHook off)
    serverConfigDiag,                     // null => sentry.server.config never executed at boot
    hasClientNow: !!client,
    flushed,                              // true => Sentry accepted the event (DSN is valid)
    eventId,
    nodeEnv: process.env.NODE_ENV,
    dsnHost: dsn?.host ?? null,
    dsnProjectId: dsn?.projectId ?? null,
  });
}
