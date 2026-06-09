import { prisma } from "@/lib/db";
import { planFromPriceId } from "@/lib/plans";

const STATUS_MAP: Record<string, "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" | "NONE"> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "PAST_DUE",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  paused: "PAST_DUE",
};

/**
 * Called when the Checkout Session completes for an org billing purchase
 * (subscription start OR single-event one-time purchase).
 */
export async function handleBillingCheckoutCompleted(
  organizationId: string,
  planKey: string,
  kind: string | undefined,
  session: any,
) {
  // Always link the Stripe customer to the org if not already
  if (session.customer) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: String(session.customer) },
    }).catch(() => {});
  }

  if (kind === "single_event_credit" || planKey === "SINGLE_EVENT") {
    // One-time purchase — increment credit counter AND activate the account
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        singleEventCredits: { increment: 1 },
        planSelected: true,
      },
    });
    return;
  }

  // Subscription — Stripe will fire customer.subscription.created shortly,
  // but we can already mark the org as on the new plan optimistically and activate it.
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      subscriptionPlan: planKey as any,
      subscriptionStatus: "ACTIVE",
      planSelected: true,
    },
  });
}

/**
 * Called for customer.subscription.{created,updated,deleted}
 */
export async function handleSubscriptionEvent(sub: any, eventType: string) {
  const customerId: string = sub.customer;
  const org = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
  if (!org) return;

  // What plan does this subscription represent?
  const priceId = sub.items?.data?.[0]?.price?.id;
  const planKey = planFromPriceId(priceId) ?? org.subscriptionPlan;

  const status = STATUS_MAP[sub.status] ?? "NONE";
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  if (eventType === "customer.subscription.deleted" || status === "CANCELED") {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        subscriptionPlan: "FREE",
        subscriptionStatus: "NONE",
        stripeSubscriptionId: null,
        subscriptionCurrentPeriodEnd: null,
        subscriptionCancelAtPeriodEnd: false,
      },
    });
    return;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionPlan: planKey as any,
      subscriptionStatus: status,
      stripeSubscriptionId: sub.id,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionCancelAtPeriodEnd: !!sub.cancel_at_period_end,
      planSelected: true, // active subscription = plan selected
    },
  });
}

/**
 * Called for invoice.payment_failed — mark org as PAST_DUE so we can
 * show a warning in the dashboard.
 */
export async function handleInvoicePaymentFailed(invoice: any) {
  const customerId: string = invoice.customer;
  if (!customerId) return;
  await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: "PAST_DUE" },
  });
}

/**
 * Called for account.updated — keeps the org's Connect account status in sync.
 * Fires every time an organizer makes progress in Stripe's hosted onboarding.
 */
export async function handleConnectAccountUpdated(acct: any) {
  const accountId: string = acct.id;
  const orgId = acct.metadata?.organizationId;
  const where = orgId ? { id: orgId } : { stripeAccountId: accountId };

  const status =
    acct.charges_enabled && acct.payouts_enabled ? "verified"
    : acct.requirements?.disabled_reason ? "restricted"
    : acct.details_submitted ? "pending"
    : "incomplete";

  await prisma.organization.updateMany({
    where,
    data: {
      stripeAccountId: accountId,
      stripeAccountChargesEnabled: !!acct.charges_enabled,
      stripeAccountPayoutsEnabled: !!acct.payouts_enabled,
      stripeAccountDetailsSubmitted: !!acct.details_submitted,
      stripeAccountStatus: status,
    },
  });
}
