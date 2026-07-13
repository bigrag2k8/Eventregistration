/**
 * Stripe Connect configuration.
 * Each Organization gets an Express account; payments route to them via
 * Destination Charges (platform creates PaymentIntent, money flows to
 * connected account via transfer_data.destination). Platform takes
 * application_fee_amount on every transaction.
 */

/**
 * Platform fee charged to organizers — 5% of the SALE VALUE
 * (ticket subtotal minus discounts). It is NOT charged on sales tax (a
 * government pass-through the organizer remits) or the processing fee (a
 * Stripe pass-through), matching how Eventbrite's service fee works.
 */
export const PLATFORM_FEE_PERCENT = 5;

/**
 * Minimum platform fee per paid transaction (in cents). Floor exists because
 * Stripe's processing cost (2.9% + $0.30) eats more than the 5% percentage
 * fee on small tickets — without a floor the platform loses money on every
 * small-dollar charge. $1.25 keeps the platform net-positive on every paid
 * ticket and funds reinvestment beyond hosting costs. Does NOT apply to free
 * transactions (feeBaseCents === 0).
 */
export const MIN_PLATFORM_FEE_CENTS = 125;

/** Compute the application fee (in cents) from the fee base (the sale value). */
export function platformFeeCents(feeBaseCents: number): number {
  if (feeBaseCents <= 0) return 0;
  const percentage = Math.round(feeBaseCents * (PLATFORM_FEE_PERCENT / 100));
  return Math.max(percentage, MIN_PLATFORM_FEE_CENTS);
}

/**
 * Series drop-in fee cap: on RECURRING-SERIES occurrences the $1.25 minimum is
 * capped at this percent of the ticket, so cheap class tickets (< $12.50) never
 * pay an effective rate above 10%. A $5 class pays $0.50, not $1.25 — keeps the
 * pricing story honest in the segment series target, and nudges organizers
 * toward the full-series bundle (a single 5% transaction). One-off events keep
 * the plain minimum.
 */
export const SERIES_FEE_CAP_PERCENT = 10;

/** Application fee for a series-occurrence drop-in: 5%, min $1.25, capped at 10%. */
export function seriesDropInFeeCents(feeBaseCents: number): number {
  if (feeBaseCents <= 0) return 0;
  const cap = Math.max(1, Math.round(feeBaseCents * (SERIES_FEE_CAP_PERCENT / 100)));
  return Math.min(platformFeeCents(feeBaseCents), cap);
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
  /** Exact fee override (e.g. the series drop-in cap). Default = platformFeeCents. */
  feeCentsOverride?: number,
): {
  application_fee_amount: number;
  transfer_data: { destination: string };
  on_behalf_of: string;
} | null {
  if (!org.stripeAccountId || !org.stripeAccountChargesEnabled) return null;
  return {
    // Fee is on the sale value, NOT the charged total — the caller passes the
    // sale value (subtotal - discount), never the tax/fee-inclusive total.
    application_fee_amount: feeCentsOverride ?? platformFeeCents(feeBaseCents),
    transfer_data: { destination: org.stripeAccountId },
    on_behalf_of: org.stripeAccountId,
  };
}

/** True iff the org can accept paid transactions through Connect right now. */
export function canAcceptPayments(org: ConnectReadyOrg): boolean {
  return !!org.stripeAccountId && !!org.stripeAccountChargesEnabled;
}
