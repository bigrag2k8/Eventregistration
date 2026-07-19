import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { requireRoleApi } from "@/lib/auth";

/**
 * GET /api/billing/connect/status
 *
 * Returns the current org's KYC + payouts status. Frontend polls this
 * after onboarding return to update the progress meters without a full
 * page reload. We refresh from Stripe on every call (cheap; cached
 * server-side by Stripe), so the DB stays current even if we miss a
 * webhook briefly.
 */
export async function GET() {
  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  // No Stripe account yet → KYC is "not_started"
  if (!org.stripeAccountId) {
    return NextResponse.json({
      connected: false,
      kycStatus: "not_started",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  }

  // No Stripe key → can't refresh, return what we have
  if (!stripeConfigured) {
    return NextResponse.json({
      connected: true,
      kycStatus: org.stripeAccountStatus ?? "in_progress",
      chargesEnabled: org.stripeAccountChargesEnabled,
      payoutsEnabled: org.stripeAccountPayoutsEnabled,
      detailsSubmitted: org.stripeAccountDetailsSubmitted,
      cached: true,
    });
  }

  try {
    const acct = await stripe.accounts.retrieve(org.stripeAccountId);
    const kycStatus =
      acct.charges_enabled && acct.payouts_enabled ? "verified"
      : (acct.requirements?.disabled_reason ? "restricted"
      : acct.details_submitted ? "pending_review"
      : org.stripeAccountId ? "in_progress"
      : "not_started");

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        stripeAccountChargesEnabled: acct.charges_enabled,
        stripeAccountPayoutsEnabled: acct.payouts_enabled,
        stripeAccountDetailsSubmitted: acct.details_submitted,
        stripeAccountStatus: kycStatus,
      },
    });

    return NextResponse.json({
      connected: true,
      kycStatus,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      detailsSubmitted: acct.details_submitted,
      requirements: {
        currentlyDue: acct.requirements?.currently_due ?? [],
        eventuallyDue: acct.requirements?.eventually_due ?? [],
        pastDue: acct.requirements?.past_due ?? [],
        disabledReason: acct.requirements?.disabled_reason ?? null,
      },
    });
  } catch (e: any) {
    console.error("[connect/status] Stripe error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Couldn't fetch status." }, { status: 502 });
  }
}
