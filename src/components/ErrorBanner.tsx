/**
 * Shared inline error banner for server-action validation failures.
 * Actions redirect with ?error=<code> (never throw on user input — a thrown
 * error renders the useless "Application error: Digest" page); pages render
 * <ErrorBanner code={searchParams.error} />.
 */
const MESSAGES: Record<string, string> = {
  date_order: "End time must be after the start time. Please fix the dates and submit again.",
  validation: "Some fields were invalid. Check your inputs and try again.",
  no_ticket_types: "Add at least one ticket type before publishing.",
  payouts_required: "Set up payouts in Billing before adding paid ticket types. Free tickets are fine.",
  tt_has_regs: "That ticket type already has registrations and can't be deleted.",
  refund_no_payment: "No completed payment found for this registration.",
  refund_failed: "The refund could not be processed. Try again, or check the Stripe dashboard.",
  stripe_not_configured: "Payments are not configured for this site.",
  plan_limit: "Your plan's monthly event limit is reached. Upgrade or buy a single-event credit in Billing.",
  no_credits: "You don't have a single-event credit to spend. Buy one in Billing, then try again.",
  campaign_limit: "Your plan's email campaign limit for this event is reached. Upgrade in Billing to send more.",
  no_recipients: "This event has no confirmed registrations yet — nothing to send.",
  already_member: "That email is already a member of this organization.",
  exists_elsewhere: "An account with that email already exists outside this organization. They cannot be invited.",
  invite_pending: "A pending invite to that email already exists. Use Resend or Revoke from the team page.",
  remove_self: "You can't remove yourself from your own organization.",
  reserved_slug: "That slug is reserved. Pick another.",
  slug_taken: "That slug is already taken.",
  presale_percent: "Presale discount must be a percentage between 1 and 100.",
  presale_date: "Pick a date and time for when the presale ends.",
  presale_no_paid_tickets: "Presale discounts apply to paid tickets — add a paid ticket type first.",
  vendor_not_refundable: "Only a PAID vendor application can be refunded.",
  resync_failed: "Could not re-sync the subscription from Stripe. Check the Stripe dashboard and try again.",
  resync_no_subscription: "This org has no Stripe subscription to re-sync.",
  reissue_failed: "Couldn't reissue the tickets. Try again, or check the email logs.",
  reissue_not_confirmed: "Only confirmed registrations have tickets to reissue.",
};

export function ErrorBanner({ code }: { code?: string }) {
  if (!code) return null;
  const msg = MESSAGES[code] ?? "Something went wrong. Please try again.";
  return (
    <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
      ⚠ {msg}
    </div>
  );
}
