import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { requireRoleApi } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export async function POST(req: Request) {
  // Build redirects off NEXT_PUBLIC_APP_URL, NOT req.url — behind the Railway
  // proxy req.url is the internal bind address (http://0.0.0.0:8080), so
  // new URL(path, req.url) would send the browser to an unreachable host.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const back = (path: string) => NextResponse.redirect(`${appUrl}${path}`, 303);

  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;
  if (!session.orgId) return back("/dashboard");

  const form = await req.formData();
  const planKey = String(form.get("planKey") ?? "");
  const plan = PLANS[planKey as keyof typeof PLANS];
  // One-time credits may sell without a pre-created Stripe price (an inline
  // price_data line item is built below); subscriptions always need one.
  const canInlinePrice = plan?.cadence === "one_time" && plan.priceCents > 0;
  if (!plan || (!plan.stripePriceId && !canInlinePrice)) {
    return back("/dashboard/billing?canceled=invalid_plan");
  }

  // Optional return-after-success destination. Whitelisted to local /dashboard/*
  // paths so this can't be turned into an open redirect: the caller passes a
  // relative path, we reject anything else and fall back to the billing page.
  const rawReturnTo = String(form.get("returnTo") ?? "").trim();
  const safeReturnTo =
    rawReturnTo.startsWith("/dashboard/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : null;

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) return back("/dashboard");

  // Referral coupon: a "50% off next single-event credit" reward the org earned
  // by referring an organizer. Applies to SINGLE_EVENT only. Not consumed here —
  // the id rides in checkout metadata and is marked redeemed by the webhook when
  // the purchase actually completes, so a cancelled checkout keeps the coupon.
  const referralReward =
    plan.key === "SINGLE_EVENT"
      ? await prisma.referralReward.findFirst({
          where: { referrerOrgId: org.id, redeemedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "asc" },
          select: { id: true },
        })
      : null;

  // One live subscription per org: starting a second Checkout while one exists
  // double-bills (Stripe happily creates both; our webhook just overwrites
  // with whichever event lands last). Plan changes go through the Billing
  // Portal instead. One-time credits are unaffected.
  if (
    plan.cadence === "monthly" &&
    org.stripeSubscriptionId &&
    ["ACTIVE", "TRIALING", "PAST_DUE"].includes(org.subscriptionStatus)
  ) {
    return back("/dashboard/billing?canceled=existing_subscription");
  }

  // Mint a fresh Stripe Customer and overwrite whatever (if anything) is stored.
  async function mintCustomer(): Promise<string> {
    const customer = await stripe.customers.create({
      email: org!.contactEmail ?? undefined,
      name: org!.name,
      metadata: { organizationId: org!.id },
    });
    await prisma.organization.update({
      where: { id: org!.id },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  // Ensure org has a Stripe Customer. Two concurrent billing clicks could each
  // create one, so we claim the slot with a conditional update; if we lost the
  // race, delete the customer we just made and reuse the winner's.
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: org.contactEmail ?? undefined,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    const claimed = await prisma.organization.updateMany({
      where: { id: org.id, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });
    if (claimed.count === 1) {
      customerId = customer.id;
    } else {
      // Someone else set it first — discard our duplicate, use the existing one.
      await stripe.customers.del(customer.id).catch(() => {});
      const fresh = await prisma.organization.findUnique({
        where: { id: org.id }, select: { stripeCustomerId: true },
      });
      customerId = fresh?.stripeCustomerId ?? customer.id;
    }
  }

  // If a safe returnTo was supplied (e.g. /dashboard/events/new) come back there
  // with ?bought=<planKey> so the caller can react (banner + pre-select Single
  // Event). Otherwise default to the billing page as before.
  const successUrl = safeReturnTo
    ? `${appUrl}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}bought=${plan.key}`
    : `${appUrl}/dashboard/billing?upgraded=${plan.key}`;
  const cancelUrl = safeReturnTo
    ? `${appUrl}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}canceled=1`
    : `${appUrl}/dashboard/billing?canceled=1`;

  const creditKind = plan.key === "RECURRING_EVENT_CREDIT" ? "recurring_event_credit" : "single_event_credit";
  // A referral coupon is a per-org 50%-off; there's no Stripe Price for the
  // discounted amount, so build an inline price_data line item at half price and
  // bypass the configured Price ID.
  const discounted = referralReward ? Math.round(plan.priceCents / 2) : null;
  const lineItem =
    plan.stripePriceId && discounted === null
      ? { price: plan.stripePriceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: discounted ?? plan.priceCents,
            product_data: {
              name: discounted !== null ? `${plan.name} credit (referral: 50% off)` : `${plan.name} credit`,
              description: plan.blurb,
            },
          },
        };
  const baseMeta = { organizationId: org.id, planKey: plan.key, ...(referralReward ? { referralRewardId: referralReward.id } : {}) };
  const buildParams = (cid: string) => ({
    customer: cid,
    mode: (plan.cadence === "one_time" ? "payment" : "subscription") as "payment" | "subscription",
    line_items: [lineItem],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: baseMeta,
    ...(plan.cadence !== "one_time" && {
      subscription_data: { metadata: { organizationId: org.id, planKey: plan.key } },
    }),
    ...(plan.cadence === "one_time" && {
      payment_intent_data: {
        metadata: { ...baseMeta, kind: creditKind },
      },
    }),
  });

  let checkoutSession;
  try {
    checkoutSession = await stripe.checkout.sessions.create(buildParams(customerId));
  } catch (e: any) {
    // A stored customer from a previous Stripe account/sandbox no longer exists
    // under the current key ("No such customer"). Mint a fresh one and retry
    // once so the org self-heals instead of being permanently unable to pay.
    const staleCustomer =
      e?.code === "resource_missing" &&
      (e?.param === "customer" || /no such customer/i.test(e?.message ?? ""));
    if (staleCustomer) {
      try {
        customerId = await mintCustomer();
        checkoutSession = await stripe.checkout.sessions.create(buildParams(customerId));
      } catch (e2: any) {
        console.error("[billing] checkout retry after stale customer failed", {
          planKey: plan.key, priceId: plan.stripePriceId, error: e2?.message,
        });
        return back("/dashboard/billing?canceled=stripe_error");
      }
    } else {
      // Surface the real Stripe reason (e.g. "No such price" when the price ID
      // belongs to a different account than this key) instead of a silent 500.
      console.error("[billing] checkout.sessions.create failed", {
        planKey: plan.key, priceId: plan.stripePriceId, error: e?.message,
      });
      return back("/dashboard/billing?canceled=stripe_error");
    }
  }

  if (!checkoutSession.url) {
    return back("/dashboard/billing?canceled=stripe_error");
  }
  return NextResponse.redirect(checkoutSession.url, 303);
}
