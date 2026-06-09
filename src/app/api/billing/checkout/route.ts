import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export async function POST(req: Request) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) return NextResponse.redirect(new URL("/dashboard", req.url), 303);

  const form = await req.formData();
  const planKey = String(form.get("planKey") ?? "");
  const plan = PLANS[planKey as keyof typeof PLANS];
  if (!plan || !plan.stripePriceId) {
    return NextResponse.redirect(new URL("/dashboard/billing?canceled=invalid_plan", req.url), 303);
  }

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) return NextResponse.redirect(new URL("/dashboard", req.url), 303);

  // Ensure org has a Stripe Customer
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: org.contactEmail ?? undefined,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await prisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?upgraded=${plan.key}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=1`;

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: plan.cadence === "one_time" ? "payment" : "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId: org.id, planKey: plan.key },
    ...(plan.cadence !== "one_time" && {
      subscription_data: {
        metadata: { organizationId: org.id, planKey: plan.key },
      },
    }),
    ...(plan.cadence === "one_time" && {
      payment_intent_data: {
        metadata: { organizationId: org.id, planKey: plan.key, kind: "single_event_credit" },
      },
    }),
  });

  if (!checkoutSession.url) {
    return NextResponse.redirect(new URL("/dashboard/billing?canceled=stripe_error", req.url), 303);
  }
  return NextResponse.redirect(checkoutSession.url, 303);
}
