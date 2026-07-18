import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/auth";

const SITE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app").replace(/\/+$/, "");

async function optOut(token: string): Promise<boolean> {
  const claim = await verifyUnsubscribeToken(token);
  if (!claim) return false;
  await prisma.marketingUnsubscribe.upsert({
    where: { organizationId_email: { organizationId: claim.organizationId, email: claim.email } },
    create: { organizationId: claim.organizationId, email: claim.email },
    update: {},
  });
  return true;
}

/**
 * RFC 8058 one-click unsubscribe: Gmail / Apple Mail POST here when the user
 * taps the native "Unsubscribe" control (List-Unsubscribe + List-Unsubscribe-Post
 * headers point at this URL). The signed token IS the authorization — no session.
 * Idempotent; must return 200 fast.
 */
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const ok = await optOut(params.token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

/**
 * Some mail clients (and link scanners) GET the List-Unsubscribe URL instead of
 * POSTing. Don't opt out on a bare GET — a scanner would silently unsubscribe
 * people — just send them to the human confirmation page.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  return NextResponse.redirect(`${SITE}/unsubscribe/${params.token}`);
}
