/**
 * Stripe Connect configuration.
 * Each Organization gets an Express account; payments route to them via
 * Destination Charges (platform creates PaymentIntent, money flows to
 * connected account via transfer_data.destination). Platform takes
 * application_fee_amount on every transaction.
 */

/**
 * Platform fee charged to organizers — 4.5% of the SALE VALUE
 * (ticket subtotal minus discounts). It is NOT charged on sales tax (a
 * government pass-through the organizer remits) or the processing fee (a
 * Stripe pass-through), matching how Eventbrite's service fee works.
 */
export const PLATFORM_FEE_PERCENT = 4.5;

/**
 * Minimum platform fee per paid transaction (in cents). Floor exists because
 * Stripe's processing cost (2.9% + $0.30) eats more than the 4.5% percentage
 * fee on tickets under ~$19 — without a floor the platform loses money on
 * every small-dollar charge. $0.90 keeps the platform net-positive on every
 * paid ticket. Does NOT apply to free transactions (feeBaseCents === 0).
 */
export const MIN_PLATFORM_FEE_CENTS = 90;

/** Compute the application fee (in cents) from the fee base (the sale value). */
export function platformFeeCents(feeBaseCents: number): number {
  if (feeBaseCents <= 0) return 0;
  const percentage = Math.round(feeBaseCents * (PLATFORM_FEE_PERCENT / 100));
  return Math.max(percentage, MIN_PLATFORM_FEE_CENTS);
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
  feeBaseCents: number,
): {
  application_fee_amount: number;
  transfer_data: { destination: string };
  on_behalf_of: string;
} | null {
  if (!org.stripeAccountId || !org.stripeAccountChargesEnabled) return null;
  return {
    // Fee is on the sale value, NOT the charged total — the caller passes the
    // sale value (subtotal - discount), never the tax/fee-inclusive total.
    application_fee_amount: platformFeeCents(feeBaseCents),
    transfer_data: { destination: org.stripeAccountId },
    on_behalf_of: org.stripeAccountId,
  };
}

/** True iff the org can accept paid transactions through Connect right now. */
export function canAcceptPayments(org: ConnectReadyOrg): boolean {
  return !!org.stripeAccountId && !!org.stripeAccountChargesEnabled;
}
