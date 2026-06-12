/**
 * Stripe Connect configuration.
 * Each Organization gets an Express account; payments route to them via
 * Destination Charges (platform creates PaymentIntent, money flows to
 * connected account via transfer_data.destination). Platform takes
 * application_fee_amount on every transaction.
 */

/** Platform fee charged to organizers — 4.5% of the total payment. */
export const PLATFORM_FEE_PERCENT = 4.5;

/** Compute the application fee (in cents) we collect on a payment. */
export function platformFeeCents(amountCents: number): number {
  return Math.max(0, Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100)));
}

/**
 * Returns the payment_intent_data slice that routes funds to the
 * connected account and reserves our platform fee — or null if the
 * org isn't ready to accept payments yet (no account, or not verified).
 *
 * Pattern: Destination Charges with on_behalf_of.
 *  - platform is merchant of record for dispute purposes
 *  - on_behalf_of sets the settlement merchant so the customer's
 *    statement reads as the organizer, not us
 *  - transfer_data.destination + application_fee_amount split the funds
 */
export interface ConnectReadyOrg {
  stripeAccountId: string | null;
  stripeAccountChargesEnabled: boolean;
}

export function connectChargeParams(
  org: ConnectReadyOrg,
  totalCents: number,
): {
  application_fee_amount: number;
  transfer_data: { destination: string };
  on_behalf_of: string;
} | null {
  if (!org.stripeAccountId || !org.stripeAccountChargesEnabled) return null;
  return {
    application_fee_amount: platformFeeCents(totalCents),
    transfer_data: { destination: org.stripeAccountId },
    on_behalf_of: org.stripeAccountId,
  };
}

/** True iff the org can accept paid transactions through Connect right now. */
export function canAcceptPayments(org: ConnectReadyOrg): boolean {
  return !!org.stripeAccountId && !!org.stripeAccountChargesEnabled;
}
