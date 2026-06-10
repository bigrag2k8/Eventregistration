import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { issueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

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

      await prisma.$transaction(async (tx) => {
        const reg = await tx.registration.findUnique({ where: { id: regId } });
        if (!reg || reg.status !== "PENDING") return;
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
      });

      await issueTickets(regId);
      await sendConfirmationEmail(regId);
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
        await prisma.registration.update({
          where: { id: payment.registrationId },
          data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
        if (fullyRefunded) {
          await prisma.ticket.updateMany({
            where: { registrationId: payment.registrationId },
            data: { isValid: false, invalidatedAt: new Date(), invalidReason: "refund" },
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
