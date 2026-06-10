import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const UPGRADE_THRESHOLD_CENTS = 20_000_00; // $20,000 lifetime sales

/**
 * POST /api/billing/connect/upgrade-to-business
 *
 * Converts an organizer's Stripe Express account from business_type=
 * "individual" to "company". This triggers Stripe to collect the
 * additional fields (legal business name, EIN, business address,
 * authorized representative info).
 *
 * Eligibility: lifetime SUCCEEDED Stripe charges must exceed $20K
 * — OR the request comes from a SUPERADMIN doing an override.
 *
 * Flow:
 *   1. Recompute lifetime sales from Payments table
 *   2. If >= $20K (or SUPERADMIN), update Stripe account business_type
 *   3. Generate a new accountLink so the organizer can fill in company
 *      fields. We still pass `currently_due` so Stripe only asks for
 *      what's now-needed, not everything at once.
 */
export async function POST(req: Request) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeAccountId) {
    return NextResponse.json({ error: "Set up payouts first, then upgrade." }, { status: 400 });
  }

  // Compute lifetime sales (sum of all SUCCEEDED payments tied to this org's events)
  const sales = await prisma.payment.aggregate({
    where: {
      status: "SUCCEEDED",
      registration: { event: { organizationId: org.id } },
    },
    _sum: { amountCents: true },
  });
  const lifetimeCents = sales._sum.amountCents ?? 0;

  const isOverride = session.role === "SUPERADMIN";
  const eligible = isOverride || lifetimeCents >= UPGRADE_THRESHOLD_CENTS;
  if (!eligible) {
    return NextResponse.json({
      error: `Upgrade to business is available after $20,000 in lifetime sales. You're at $${(lifetimeCents / 100).toFixed(2)}.`,
      lifetimeCents,
      thresholdCents: UPGRADE_THRESHOLD_CENTS,
    }, { status: 403 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  try {
    // 1. Flip the account to "company" — Stripe will then require the
    //    company-only fields on the next onboarding session.
    await stripe.accounts.update(org.stripeAccountId, {
      business_type: "company",
    });

    // 2. Issue a fresh onboarding link that collects only what's now due
    //    (i.e., the new company fields), not everything.
    const link = await stripe.accountLinks.create({
      account: org.stripeAccountId,
      refresh_url: `${baseUrl}/api/billing/connect/refresh`,
      return_url: `${baseUrl}/dashboard/settings?connect=return&upgraded=1`,
      type: "account_onboarding",
      collection_options: { fields: "currently_due" },
    });

    await audit({
      organizationId: org.id, userId: session.sub,
      action: "stripe_connect.upgraded_to_business",
      targetType: "Organization", targetId: org.id,
      metadata: { lifetimeCents, override: isOverride },
    });

    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error("[connect/upgrade-to-business] error:", e?.message);
    return NextResponse.json({
      error: e?.message ?? "Couldn't start business upgrade.",
    }, { status: 502 });
  }
}
