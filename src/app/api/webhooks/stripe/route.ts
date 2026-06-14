import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { issueTickets, releaseSeats, releasePromoUse } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";
import { notifyOps } from "@/lib/alert";

export const runtime = "nodejs";

/**
 * A paid Checkout session arrived but there's no PENDING registration to
 * attach it to (the reg was purged as abandoned, deleted by the duplicate-
 * registration path, or this is a second session paid after the first already
 * confirmed). The money is captured with no home, so auto-refund it instead of
 * throwing — throwing would 500 and make Stripe retry the same dead event for
 * days. Caller has already verified no Payment row exists for this PaymentIntent.
 */
async function refundOrphanSession(session: any, regId: string, paymentIntentId: string) {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { reason: "orphan_session", registrationId: regId, sessionId: session.id },
    });
    console.warn("[webhook] auto-refunded orphan paid session", {
      sessionId: session.id, registrationId: regId, paymentIntent: paymentIntentId,
    });
  } catch (e: any) {
    // Never rethrow — a failed refund must not 500 the webhook (that just
    // triggers more retries). Log loudly for manual reconciliation. An
    // "already refunded" error here is expected on event redelivery.
    console.error("[webhook] FAILED to auto-refund orphan session — manual reconciliation may be needed", {
      sessionId: session.id, registrationId: regId, paymentIntent: paymentIntentId, error: e?.message,
    });
    // Page the platform team — a stuck charge needs a human, and a console line
    // in a webhook is easy to miss. Non-throwing, so it can't worsen the failure.
    await notifyOps(
      "Orphan-session auto-refund FAILED — manual reconciliation needed",
      `A paid Checkout session had no registration to attach to, and the automatic refund failed.\n\n` +
        `Session: ${session.id}\nPaymentIntent: ${paymentIntentId}\nRegistration: ${regId}\nError: ${e?.message}\n\n` +
        `The customer may have been charged with nothing delivered. Refund manually in the Stripe dashboard.`,
    );
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = headers().get("stripe-signature") ?? "";
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch (e: any) {
    // Log signature failures (otherwise they 400 silently and look like the
    // endpoint never received anything).
    console.error("[webhook] signature verification failed", e?.message);
    return new NextResponse(`Webhook signature failure: ${e.message}`, { status: 400 });
  }

  // One line per received event so delivery is visible in app logs.
  console.log("[webhook] received", event.type);

  // Stripe delivers at-least-once: claim this event id before processing so a
  // redelivery no-ops instead of re-running side effects (duplicate credit
  // grants, duplicate confirmation emails). P2002 means already processed.
  try {
    await prisma.webhookEvent.create({ data: { stripeEventId: event.id, type: event.type } });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ received: true, duplicate: true });
    throw e;
  }

  // Run the actual handler inside a wrapper: on failure, release the claim so
  // Stripe's retry can reprocess rather than being swallowed as a duplicate.
  const handleEvent = async () => {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as any;

      // Org subscription / one-time billing checkout
      const orgIdFromBilling = session.metadata?.organizationId;
      const planKey = session.metadata?.planKey;
      const kind = session.metadata?.kind ?? session.payment_intent?.metadata?.kind;
      if (orgIdFromBilling && planKey) {
        const { handleBillingCheckoutCompleted } = await import("@/server/billing");
        await handleBillingCheckoutCompleted(orgIdFromBilling, planKey, kind, session);
        break;
      }

      // Vendor booth payment
      const vendorAppId = session.metadata?.vendorApplicationId;
      if (vendorAppId) {
        const { finalizeVendor } = await import("@/server/vendors");
        await finalizeVendor(vendorAppId, {
          sessionId: session.id,
          paymentIntentId: session.payment_intent ?? null,
          amountCents: session.amount_total ?? null,
          currency: session.currency ?? null,
          platformFeeCents: Number(session.metadata?.platformFeeCents ?? 0) || 0,
        });
        break;
      }

      const regId = session.metadata?.registrationId;
      if (!regId) break;

      // Returns true ONLY when this delivery actually flipped the reg
      // PENDING -> CONFIRMED. Redeliveries and dead regs return false so we
      // don't re-issue tickets / re-send email / mis-refund.
      const confirmed = await prisma.$transaction(async (tx) => {
        const reg = await tx.registration.findUnique({ where: { id: regId } });
        if (!reg || reg.status !== "PENDING") return false;
        await tx.registration.update({
          where: { id: regId },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            stripePaymentIntentId: session.payment_intent ?? null,
          },
        });
        await tx.payment.create({
          data: {
            registrationId: regId,
            amountCents: session.amount_total ?? reg.totalCents,
            platformFeeCents: Number(session.metadata?.platformFeeCents ?? 0) || 0,
            currency: (session.currency ?? reg.currency).toUpperCase(),
            status: "SUCCEEDED",
            stripePaymentIntentId: session.payment_intent ?? null,
          },
        });
        return true;
      });

      if (confirmed) {
        await issueTickets(regId);
        await sendConfirmationEmail(regId);
      } else {
        // Transaction did nothing: the reg is gone, cancelled, or already
        // confirmed. Decide whether THIS session's money is accounted for.
        // If a Payment row already exists for its PaymentIntent, this is just
        // a redelivery of a legitimate charge — do nothing. Otherwise the
        // money is orphaned (purged/deleted reg, or a duplicate second
        // session) and we auto-refund so the customer is never charged for
        // nothing. Critically, this avoids refunding the real payment on the
        // at-least-once webhook redeliveries Stripe sends.
        const pi = (session.payment_intent as string | null) ?? null;
        if (session.payment_status === "paid" && pi) {
          const existing = await prisma.payment.findFirst({
            where: { stripePaymentIntentId: pi },
          });
          if (!existing) {
            await refundOrphanSession(session, regId, pi);
          }
        }
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as any;
      const intentId = charge.payment_intent;
      const payment = await prisma.payment.findFirst({ where: { stripePaymentIntentId: intentId } });
      if (payment) {
        const refunded = charge.amount_refunded as number;
        // A "net" refund returns everything except the withheld platform fee, so
        // treat refunding (gross - fee) or more as a full cancellation — release
        // the seat and invalidate tickets, don't leave it PARTIALLY_REFUNDED.
        const fee = payment.platformFeeCents ?? 0;
        const fullyRefunded = refunded >= payment.amountCents - fee;
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmountCents: refunded,
            status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
            stripeRefundId: charge.refunds?.data?.[0]?.id,
          },
        });
        const reg = await prisma.registration.findUnique({
          where: { id: payment.registrationId },
          select: { ticketTypeId: true, quantity: true, promoCodeId: true },
        });
        if (fullyRefunded) {
          // Conditional flip so only the FIRST delivery transitions to REFUNDED
          // (charge.refunded is redelivered at-least-once). releaseSeats then
          // runs exactly once, not on every retry.
          const flipped = await prisma.registration.updateMany({
            where: { id: payment.registrationId, status: { not: "REFUNDED" } },
            data: { status: "REFUNDED" },
          });
          await prisma.ticket.updateMany({
            where: { registrationId: payment.registrationId },
            data: { isValid: false, invalidatedAt: new Date(), invalidReason: "refund" },
          });
          if (flipped.count === 1 && reg) {
            await releaseSeats(prisma, reg.ticketTypeId, reg.quantity);
            await releasePromoUse(prisma, reg.promoCodeId);
          }
        } else {
          await prisma.registration.update({
            where: { id: payment.registrationId },
            data: { status: "PARTIALLY_REFUNDED" },
          });
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as any;
      const { handleSubscriptionEvent } = await import("@/server/billing");
      await handleSubscriptionEvent(sub, event.type);
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as any;
      const { handleInvoicePaymentFailed } = await import("@/server/billing");
      await handleInvoicePaymentFailed(inv);
      break;
    }
    case "invoice.paid": {
      // Subscription / one-time billing revenue — record it to the invoice ledger.
      const inv = event.data.object as any;
      const { handleInvoicePaid } = await import("@/server/billing");
      await handleInvoicePaid(inv);
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = event.data.object as any;
      const { handleDisputeEvent } = await import("@/server/billing");
      const ctx = await handleDisputeEvent(dispute);
      // Alert the team the moment a dispute opens — it pulls funds + fees back.
      if (event.type === "charge.dispute.created" && ctx) {
        await notifyOps(
          `New card dispute opened — ${(ctx.amountCents / 100).toFixed(2)} ${(dispute.currency ?? "usd").toUpperCase()}`,
          `A chargeback was filed.\n\nDispute: ${dispute.id}\nReason: ${ctx.reason ?? "unknown"}\n` +
            `Amount: ${(ctx.amountCents / 100).toFixed(2)}\nOrg: ${ctx.organizationId ?? "unresolved"}\n` +
            `PaymentIntent: ${dispute.payment_intent ?? "n/a"}\n\nRespond in the Stripe dashboard before the evidence deadline.`,
        );
      }
      break;
    }
    case "account.updated":
    case "capability.updated": {
      // Connect: organizer's Express account or a capability status changed.
      const obj = event.data.object as any;
      const { handleConnectAccountUpdated } = await import("@/server/billing");
      if (event.type === "account.updated") {
        await handleConnectAccountUpdated(obj);
      } else {
        // capability.updated — fetch the full parent account to re-sync.
        const accountId = (obj?.account as string) ?? (event as any).account;
        if (accountId) {
          const acct = await stripe.accounts.retrieve(accountId);
          await handleConnectAccountUpdated(acct);
        }
      }
      break;
    }
    case "account.application.deauthorized": {
      // Organizer disconnected our platform — clear the link.
      const accountId = (event as any).account;
      if (accountId) {
        await prisma.organization.updateMany({
          where: { stripeAccountId: accountId },
          data: {
            stripeAccountId: null,
            stripeAccountChargesEnabled: false,
            stripeAccountPayoutsEnabled: false,
            stripeAccountDetailsSubmitted: false,
            stripeAccountStatus: "not_started",
          },
        });
      }
      break;
    }
  }
  };

  try {
    await handleEvent();
  } catch (e) {
    await prisma.webhookEvent.delete({ where: { stripeEventId: event.id } }).catch(() => {});
    throw e;
  }

  return NextResponse.json({ received: true });
}
