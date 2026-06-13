import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

/**
 * TEMPORARY: verifies the server→Sentry pipe by capturing one test event and
 * reporting init diagnostics. Token-gated; remove after confirming delivery.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (key !== "verify-sentry-3f9c7a21") {
    return new NextResponse("Not found", { status: 404 });
  }

  const eventId = Sentry.captureException(new Error("Sentry pipe verification — safe to ignore"));
  const flushed = await Sentry.flush(4000);

  const client = Sentry.getClient();
  const dsn = client?.getDsn();
  return NextResponse.json({
    eventId,
    flushed,                                  // false => the send failed (bad/unreachable DSN)
    nodeEnv: process.env.NODE_ENV,
    hasClient: !!client,
    enabled: client?.getOptions()?.enabled,
    dsnHost: dsn?.host ?? null,               // should be like o123.ingest.us.sentry.io
    dsnProjectId: dsn?.projectId ?? null,     // should match the project receiving events
    dsnConfigured: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
