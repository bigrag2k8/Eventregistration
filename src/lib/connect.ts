/**
 * Stripe Connect configuration.
 * Each Organization gets an Express account; payments route to them directly.
 * We take a platform fee on every transaction (attendee tickets, vendor booths).
 */

/** Platform fee charged to organizers — 5% of the total payment. */
export const PLATFORM_FEE_PERCENT = 5;

/** Compute the application fee (in cents) we collect on a payment. */
export function platformFeeCents(amountCents: number): number {
  return Math.max(0, Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100)));
}
