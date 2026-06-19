import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export async function POST(req: Request) {
  // Build redirects off NEXT_PUBLIC_APP_URL, NOT req.url — behind the Railway
  // proxy req.url is the internal bind address (http://0.0.0.0:8080), so
  // new URL(path, req.url) would send the browser to an unreachable host.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const back = (path: string) => NextResponse.redirect(`${appUrl}${path}`, 303);

  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return back("/dashboard");

  const form = await req.formData();
  const planKey = String(form.get("planKey") ?? "");
  const plan = PLANS[planKey as keyof typeof PLANS];
  if (!plan || !plan.stripePriceId) {
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

  const buildParams = (cid: string) => ({
    customer: cid,
    mode: (plan.cadence === "one_time" ? "payment" : "subscription") as "payment" | "subscription",
    line_items: [{ price: plan.stripePriceId!, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId: org.id, planKey: plan.key },
    ...(plan.cadence !== "one_time" && {
      subscription_data: { metadata: { organizationId: org.id, planKey: plan.key } },
    }),
    ...(plan.cadence === "one_time" && {
      payment_intent_data: {
        metadata: { organizationId: org.id, planKey: plan.key, kind: "single_event_credit" },
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
