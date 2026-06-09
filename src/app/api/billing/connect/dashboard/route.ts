import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

/**
 * Opens the organizer's Stripe Express dashboard (one-time login link).
 * From there they can manage payouts, view transactions, update bank info.
 */
export async function POST() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeAccountId) {
    return NextResponse.json({ error: "Stripe account not connected yet." }, { status: 400 });
  }

  try {
    const link = await stripe.accounts.createLoginLink(org.stripeAccountId);
    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error("[connect/dashboard] Stripe error:", { type: e?.type, code: e?.code, message: e?.message });
    return NextResponse.json({
      error: e?.message ? `Stripe error: ${e.message}` : "Couldn't open Stripe dashboard.",
    }, { status: 502 });
  }
}

/** Re-fetch account status from Stripe and persist to our DB. Called after onboarding return. */
export async function GET() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeAccountId) return NextResponse.json({ connected: false });

  try {
    const acct = await stripe.accounts.retrieve(org.stripeAccountId);
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        stripeAccountChargesEnabled: acct.charges_enabled,
        stripeAccountPayoutsEnabled: acct.payouts_enabled,
        stripeAccountDetailsSubmitted: acct.details_submitted,
        stripeAccountStatus: acct.charges_enabled && acct.payouts_enabled ? "verified"
          : acct.details_submitted ? "pending"
          : "incomplete",
      },
    });
    return NextResponse.json({
      connected: true,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      detailsSubmitted: acct.details_submitted,
    });
  } catch (e: any) {
    console.error("[connect/status] Stripe error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Couldn't fetch account status." }, { status: 502 });
  }
}
