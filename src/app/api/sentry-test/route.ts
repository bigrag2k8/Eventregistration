import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

/**
 * TEMPORARY: verifies the server→Sentry pipe by capturing one test event.
 * Token-gated so it isn't abusable; remove after confirming the event lands.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (key !== "verify-sentry-3f9c7a21") {
    return new NextResponse("Not found", { status: 404 });
  }
  const eventId = Sentry.captureException(new Error("Sentry pipe verification — safe to ignore"));
  await Sentry.flush(3000);
  return NextResponse.json({ sent: true, eventId, dsnConfigured: !!process.env.NEXT_PUBLIC_SENTRY_DSN });
}
