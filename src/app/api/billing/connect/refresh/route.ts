import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

/**
 * Stripe redirects organizers here when their onboarding link expires
 * (links are good for ~15 min). We mint a fresh one with the same
 * deferred-KYC settings and 302 them straight back to Stripe.
 *
 * Stripe hits this via GET (top-level redirect), not POST — that's why
 * we expose both.
 */
async function freshLink(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.stripeAccountId) return null;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return stripe.accountLinks.create({
    account: org.stripeAccountId,
    refresh_url: `${baseUrl}/api/billing/connect/refresh`,
    return_url: `${baseUrl}/dashboard/settings?connect=return`,
    type: "account_onboarding",
    collection_options: { fields: "currently_due" },
  });
}

export async function GET() {
  const session = await getSession();
  if (!session?.orgId) redirect("/signin");
  if (!stripeConfigured) redirect("/dashboard/settings?connect=error");
  try {
    const link = await freshLink(session.orgId);
    if (!link) redirect("/dashboard/settings?connect=error");
    redirect(link.url);
  } catch (e: any) {
    console.error("[connect/refresh GET] error:", e?.message);
    redirect("/dashboard/settings?connect=error");
  }
}

export async function POST() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  try {
    const link = await freshLink(session.orgId);
    if (!link) {
      return NextResponse.json({ error: "No Stripe account yet — call /onboard first." }, { status: 400 });
    }
    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error("[connect/refresh POST] error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Couldn't refresh link." }, { status: 502 });
  }
}
