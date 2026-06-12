import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { issueTickets, releaseSeats } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

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
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = headers().get("stripe-signature") ?? "";
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch (e: any) {
    return new NextResponse(`Webhook signature failure: ${e.message}`, { status: 400 });
  }

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
        await finalizeVendor(vendorAppId);
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
        const fullyRefunded = refunded >= payment.amountCents;
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
          select: { ticketTypeId: true, quantity: true },
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

  return NextResponse.json({ received: true });
}
