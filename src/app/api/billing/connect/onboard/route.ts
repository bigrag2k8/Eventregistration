import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Begins (or continues) Stripe Connect Express onboarding for the current org.
 * - Creates a Stripe account if the org doesn't have one yet.
 * - Generates a one-time account link and redirects the user to Stripe's hosted onboarding form.
 * - When they finish or refresh, Stripe sends them back to our return_url / refresh_url.
 */
export async function POST() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  if (!stripeConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server. Please contact support." },
      { status: 503 },
    );
  }

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  try {
    // Create the Stripe Express account on first onboard attempt
    let acctId = org.stripeAccountId;
    if (!acctId) {
      const acct = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: org.contactEmail ?? undefined,
        business_profile: {
          name: org.name,
          url: org.website ?? undefined,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { organizationId: org.id, organizationSlug: org.slug },
      });
      acctId = acct.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeAccountId: acctId },
      });
      await audit({
        organizationId: org.id, userId: session.sub,
        action: "stripe_connect.account_created",
        targetType: "Organization", targetId: org.id,
        metadata: { stripeAccountId: acctId },
      });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${base}/dashboard/settings?connect=refresh`,
      return_url: `${base}/dashboard/settings?connect=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error("[connect/onboard] Stripe error:", { type: e?.type, code: e?.code, message: e?.message });
    return NextResponse.json({
      error: e?.message ? `Stripe error: ${e.message}` : "Couldn't start Stripe onboarding right now.",
    }, { status: 502 });
  }
}
