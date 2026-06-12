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

  // Ordering guard: Stripe delivers events with no guaranteed order, so a
  // delayed `updated` for an already-cancelled subscription could otherwise
  // resurrect a dead plan. An `updated`/`deleted` only acts on the subscription
  // we currently track; a brand-new subscription always arrives via `created`
  // (and checkout.session.completed), which is allowed through.
  const isCreate = eventType === "customer.subscription.created";
  if (!isCreate && org.stripeSubscriptionId && sub.id !== org.stripeSubscriptionId) return;
  if (!isCreate && !org.stripeSubscriptionId) return;

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
 * Called for invoice.paid — record the subscription/one-time invoice as platform
 * subscription revenue. Idempotent via the unique stripeInvoiceId (Stripe redelivers).
 */
export async function handleInvoicePaid(invoice: any) {
  const stripeInvoiceId: string | undefined = invoice.id;
  if (!stripeInvoiceId) return;
  // Skip $0 invoices (trials, fully-credited) — no revenue to record.
  if ((invoice.amount_paid ?? 0) <= 0) return;

  const customerId: string | null = invoice.customer ?? null;
  const org = customerId
    ? await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } })
    : null;

  const line = invoice.lines?.data?.[0];
  const planKey = planFromPriceId(line?.price?.id) ?? null;
  const paidAtUnix = invoice.status_transitions?.paid_at ?? invoice.created;
  const createdAt = paidAtUnix ? new Date(paidAtUnix * 1000) : new Date();
  const periodStart = line?.period?.start ? new Date(line.period.start * 1000) : null;
  const periodEnd = line?.period?.end ? new Date(line.period.end * 1000) : null;

  await prisma.billingInvoice.upsert({
    where: { stripeInvoiceId },
    create: {
      stripeInvoiceId,
      organizationId: org?.id ?? null,
      stripeCustomerId: customerId,
      planKey,
      amountPaidCents: invoice.amount_paid ?? 0,
      currency: (invoice.currency ?? "usd").toUpperCase(),
      status: invoice.status ?? "paid",
      periodStart,
      periodEnd,
      createdAt,
    },
    update: {
      amountPaidCents: invoice.amount_paid ?? 0,
      status: invoice.status ?? "paid",
      organizationId: org?.id ?? undefined,
    },
  });
}

/**
 * Called for charge.dispute.{created,updated,closed} — persist the dispute and
 * resolve the affected org via the disputed PaymentIntent. Idempotent via the
 * unique stripeDisputeId. Returns the resolved context so the webhook can alert.
 */
export async function handleDisputeEvent(dispute: any) {
  const stripeDisputeId: string | undefined = dispute.id;
  if (!stripeDisputeId) return null;
  const piId: string | null = dispute.payment_intent ?? null;
  const chargeId: string | null = dispute.charge ?? null;

  const payment = piId
    ? await prisma.payment.findFirst({ where: { stripePaymentIntentId: piId } })
    : null;
  let organizationId: string | null = null;
  if (payment) {
    const reg = await prisma.registration.findUnique({
      where: { id: payment.registrationId },
      include: { event: { select: { organizationId: true } } },
    });
    organizationId = reg?.event?.organizationId ?? null;
  }
  const createdAt = dispute.created ? new Date(dispute.created * 1000) : new Date();

  await prisma.dispute.upsert({
    where: { stripeDisputeId },
    create: {
      stripeDisputeId,
      organizationId,
      paymentId: payment?.id ?? null,
      stripePaymentIntentId: piId,
      stripeChargeId: chargeId,
      amountCents: dispute.amount ?? 0,
      currency: (dispute.currency ?? "usd").toUpperCase(),
      reason: dispute.reason ?? null,
      status: dispute.status ?? "needs_response",
      createdAt,
    },
    update: {
      status: dispute.status ?? undefined,
      amountCents: dispute.amount ?? undefined,
    },
  });

  return { organizationId, amountCents: dispute.amount ?? 0, reason: dispute.reason ?? null };
}

/**
 * Called for account.updated — keeps the org's Connect account status in sync.
 * Fires every time an organizer makes progress in Stripe's hosted onboarding.
 */
export async function handleConnectAccountUpdated(acct: any) {
  const accountId: string = acct.id;
  const orgId = acct.metadata?.organizationId;
  const where = orgId ? { id: orgId } : { stripeAccountId: accountId };

  // KYC status vocabulary (consumed by the dashboard UI):
  //   not_started    — no Stripe account yet (set elsewhere)
  //   in_progress    — account exists, organizer hasn't finished onboarding
  //   pending_review — onboarding submitted, Stripe is reviewing
  //   verified       — charges + payouts both enabled
  //   restricted     — Stripe disabled the account or set a hard requirement
  const status =
    acct.charges_enabled && acct.payouts_enabled ? "verified"
    : acct.requirements?.disabled_reason ? "restricted"
    : acct.details_submitted ? "pending_review"
    : "in_progress";

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
