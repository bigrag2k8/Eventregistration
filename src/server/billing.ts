import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
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

  if (kind === "recurring_event_credit" || planKey === "RECURRING_EVENT_CREDIT") {
    // One-time recurring event credit — increments the counter; spent by
    // createRecurringEventAction to make a recurring event premium (bundle + unlimited regs +
    // branding). Recorded as platform revenue like the single-event credit.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { recurringEventCredits: { increment: 1 }, planSelected: true },
    });
    await recordCreditPurchase(organizationId, session, "RECURRING_EVENT_CREDIT").catch((e) =>
      console.error("[billing] failed to record recurring-event-credit purchase revenue", e),
    );
    return;
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
    // One-time Checkout (mode: payment) never creates a Stripe invoice, so
    // invoice.paid (which feeds platform "subscription/product" revenue) never
    // fires for it. Record the purchase here or it stays invisible in financials.
    // Non-fatal: a reporting-write failure must not block the credit grant.
    await recordSingleEventPurchase(organizationId, session).catch((e) =>
      console.error("[billing] failed to record single-event purchase revenue", e),
    );
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
 * Record a one-time single-event pass purchase as platform revenue.
 *
 * Stored in billing_invoices with planKey 'SINGLE_EVENT', keyed on the
 * PaymentIntent id so this live-capture path and the Stripe backfill
 * (scripts/backfill-single-event-purchases.ts) converge on the same row and
 * never double-count. Idempotent via the unique stripeInvoiceId.
 */
export async function recordSingleEventPurchase(organizationId: string | null, session: any) {
  return recordCreditPurchase(organizationId, session, "SINGLE_EVENT");
}

/** Shared invoice-recording for one-time credit purchases (single event / recurring event). */
export async function recordCreditPurchase(
  organizationId: string | null,
  session: any,
  planKey: "SINGLE_EVENT" | "RECURRING_EVENT_CREDIT",
) {
  const piId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const key = piId ?? (session.id ? String(session.id) : null);
  if (!key) return;
  const amount = session.amount_total ?? 0;
  if (amount <= 0) return; // free/credited unlock — nothing collected

  await prisma.billingInvoice.upsert({
    where: { stripeInvoiceId: key },
    create: {
      stripeInvoiceId: key,
      organizationId,
      stripeCustomerId: session.customer ? String(session.customer) : null,
      planKey,
      amountPaidCents: amount,
      currency: (session.currency ?? "usd").toUpperCase(),
      status: "paid",
      createdAt: session.created ? new Date(session.created * 1000) : new Date(),
    },
    update: {
      amountPaidCents: amount,
      status: "paid",
      organizationId: organizationId ?? undefined,
    },
  });
}

/**
 * Persist a subscription's CURRENT state onto its org. Shared by the webhook
 * handler and the admin re-sync action. `sub` should be a freshly retrieved
 * Stripe Subscription so we never write a stale, out-of-order snapshot.
 */
async function applySubscriptionToOrg(
  orgId: string,
  sub: any,
  isDelete: boolean,
  fallbackPlan: string,
) {
  const status = STATUS_MAP[sub.status] ?? "NONE";

  if (isDelete || status === "CANCELED") {
    await prisma.organization.update({
      where: { id: orgId },
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

  const priceId = sub.items?.data?.[0]?.price?.id;
  const planKey = planFromPriceId(priceId) ?? fallbackPlan;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  await prisma.organization.update({
    where: { id: orgId },
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
 * Called for customer.subscription.{created,updated,deleted}
 */
export async function handleSubscriptionEvent(sub: any, eventType: string) {
  const customerId: string = sub.customer;
  const org = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
  if (!org) return;

  const isDelete = eventType === "customer.subscription.deleted";

  // Ordering guard: ignore an event for a DIFFERENT subscription than the one we
  // already track — a stale updated/deleted for an old sub must not clobber the
  // live plan. When NO subscription is tracked yet, allow any event through so
  // the first subscription can be established by whichever event lands first
  // (created OR updated — Stripe gives no ordering guarantee). The old code
  // dropped a first `updated`, which let a stale `incomplete` `created` win and
  // leave the org stuck INCOMPLETE even after payment succeeded.
  if (org.stripeSubscriptionId && sub.id !== org.stripeSubscriptionId) return;

  // Re-fetch the live subscription so we persist its CURRENT status, not the
  // snapshot embedded in a possibly out-of-order event. Deletes are terminal —
  // skip the fetch (the object may already be gone).
  let fresh = sub;
  if (!isDelete) {
    try {
      fresh = await stripe.subscriptions.retrieve(sub.id);
    } catch {
      // Unreachable/deleted — fall back to the event payload.
    }
  }

  await applySubscriptionToOrg(org.id, fresh, isDelete, org.subscriptionPlan);
}

/**
 * SUPERADMIN reconciliation: pull an org's subscription straight from Stripe and
 * re-sync it. Fixes an org whose status drifted from Stripe (e.g. from an
 * out-of-order webhook before the ordering fix).
 */
export async function resyncOrgSubscription(
  orgId: string,
): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, reason: "org_not_found" };
  if (!org.stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "stripe_error" };
  }
  await applySubscriptionToOrg(org.id, sub, false, org.subscriptionPlan);
  return { ok: true, status: STATUS_MAP[sub.status] ?? "NONE" };
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
