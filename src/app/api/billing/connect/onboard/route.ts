import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { requireRoleApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Express Connect onboarding — optimized for the SHORTEST possible flow
 * (4 screens, ~90 sec). Key decisions:
 *
 *   - business_type: "individual"
 *       Individuals need far fewer fields than companies (no EIN, no
 *       business address proof). Organizers can upgrade to "company"
 *       later via /api/billing/connect/upgrade-to-business.
 *
 *   - business_profile.mcc = "7922"
 *       MCC 7922 = Theatrical Producers, Ticket Agencies. Pre-classifying
 *       the org skips Stripe's "what do you sell?" prompt and lowers the
 *       odds of an "additional review" requirement landing later.
 *
 *   - settings.payouts.schedule.interval — "daily" for orgs with fastPayoutsEnabled,
 *       else "manual" so a new org's ticket funds are held until the worker releases
 *       them after each event (Phase 0 payout hold; see docs/Payout-Hold-Phase0.md).
 *
 *   - collection_options.fields = "currently_due" on every accountLink
 *       This is DEFERRED KYC: Stripe only collects the bare minimum
 *       required RIGHT NOW (typically just name, email, DOB).
 *       SSN/bank details are deferred until the organizer actually
 *       receives funds. That's how we hit ~90 seconds.
 */
export async function POST() {
  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;
  if (!session.orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  if (!stripeConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server. Please contact support." },
      { status: 503 },
    );
  }

  // Rate limit: 5 attempts per org per hour. Prevents accidental hammering
  // and abuse of the accountLinks.create endpoint (which is metered).
  const rl = await rateLimit(`connect-start:${session.orgId}`, 5, 60 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many onboarding attempts. Try again in an hour." },
      { status: 429 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    include: { members: { where: { id: session.sub }, select: { email: true, firstName: true, lastName: true } } },
  });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const me = org.members[0];
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  try {
    // 1. Create the Stripe Express account on first onboard attempt.
    let acctId = org.stripeAccountId;
    if (!acctId) {
      const acct = await stripe.accounts.create({
        // Controller properties — the modern equivalent of the legacy
        // `type: "express"`. Stripe's new platform-profile model rejects a bare
        // `type: "express"` with "review the responsibilities of managing losses
        // for connected accounts"; declaring the controller explicitly resolves
        // it. These MUST mirror the platform profile:
        //   losses → platform, fees → platform, Express dashboard, Stripe-hosted KYC.
        controller: {
          losses: { payments: "application" },        // platform covers negative balances
          fees: { payer: "application" },             // platform pays Stripe fees, monetizes via application_fee
          stripe_dashboard: { type: "express" },      // organizer gets the Express dashboard
          requirement_collection: "stripe",           // Stripe-hosted onboarding collects KYC
        },
        country: "US",
        // Default to individual — minimizes required fields.
        // Convert to "company" later via upgrade endpoint when org grows.
        business_type: "individual",
        // Pre-fill the email so the first Stripe screen is already filled in.
        email: me?.email ?? org.contactEmail ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          // MCC 7922 = Theatrical / ticket agencies. Pre-classifies us.
          mcc: "7922",
          name: org.name,
          product_description: "Event ticketing and vendor booth management",
          url: `${baseUrl || "https://yourevents.app"}/o/${org.slug}`,
          support_email: org.contactEmail ?? me?.email ?? undefined,
          support_phone: org.contactPhone ?? undefined,
          support_url: org.website ?? undefined,
        },
        // Pre-fill what we can about the individual to reduce screens.
        individual: {
          email: me?.email ?? undefined,
          first_name: me?.firstName ?? undefined,
          last_name: me?.lastName ?? undefined,
          phone: org.contactPhone ?? undefined,
        },
        // Payout schedule by trust: proven orgs (fastPayoutsEnabled) get daily
        // payouts; new orgs start on "manual" so their ticket funds are HELD in
        // Stripe until the worker releases them 1 day after each event ends —
        // the Phase 0 protection against sell-then-cancel fraud. See
        // docs/Payout-Hold-Phase0.md.
        settings: {
          payouts: { schedule: { interval: org.fastPayoutsEnabled ? "daily" : "manual" } },
        },
        metadata: {
          organizationId: org.id,
          organizationSlug: org.slug,
          tier: "starter",
        },
      });
      acctId = acct.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          stripeAccountId: acctId,
          stripeAccountStatus: "in_progress",
        },
      });
      await audit({
        organizationId: org.id, userId: session.sub,
        action: "stripe_connect.account_created",
        targetType: "Organization", targetId: org.id,
        metadata: { stripeAccountId: acctId, businessType: "individual" },
      });
    }

    // 2. Generate the one-time onboarding link with DEFERRED KYC.
    //    "currently_due" tells Stripe to only collect what's required RIGHT NOW.
    //    Everything else (full SSN, bank info) is collected later, lazily,
    //    when the organizer actually receives funds.
    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${baseUrl}/api/billing/connect/refresh`,
      return_url: `${baseUrl}/dashboard/settings?connect=return`,
      type: "account_onboarding",
      collection_options: { fields: "currently_due" },
    });

    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    console.error("[connect/onboard] Stripe error:", { type: e?.type, code: e?.code, message: e?.message });
    return NextResponse.json({
      error: e?.message ? `Stripe error: ${e.message}` : "Couldn't start Stripe onboarding right now.",
    }, { status: 502 });
  }
}
