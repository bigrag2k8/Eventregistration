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
  delete_validation: "Missing or invalid delete confirmation.",
  delete_name_mismatch: "The org name you typed didn't match. Try again exactly.",
  delete_own_org: "You can't delete your own organization — ask another SUPERADMIN.",
  delete_owner_org: "The owner's organization can't be deleted from here. Use the factory reset instead.",
  member_not_found: "That team member could not be found in your organization.",
  cant_edit_superadmin: "Platform SUPERADMINs can only be edited from the platform admin area.",
  cant_change_own_role: "You can't change your own role. Ask another organizer to do it.",
  last_organizer: "You can't demote the last organizer. Promote someone else first.",
  email_in_use: "That email is already in use by another account.",
  not_found: "That record could not be found.",
  unpublish_has_registrations: "This event has registrations, so it can't go back to draft. Reschedule it, or Cancel it (which refunds attendees), instead.",
  cannot_reschedule_cancelled: "A cancelled event can't be rescheduled.",
  reschedule_dates_required: "Pick a new start and end date/time to reschedule.",
  already_cancelled: "This event is already cancelled.",
  delete_has_registrations: "This event has registrations and can't be deleted. Cancel it (which refunds attendees) or Reschedule it instead.",
  weekday_required: "Pick at least one day of the week for a weekly recurring event.",
  recurring_has_registrations: "Some upcoming sessions in this recurring event have confirmed registrations. Cancel those sessions first (which refunds attendees), then delete it.",
  recurring_credit_required: "This needs a recurring event credit ($19) — a free recurring event runs up to 2 sessions; more than that (up to 12) or an all-sessions pass needs a credit. Use the “Buy recurring event credit” button above; after checkout you'll come right back here to finish.",
  session_no_upgrade: "This is a session of a recurring event — premium comes from the recurring event's credit, not per-session upgrades.",
  marketing_cooldown: "You already sent a marketing email in the last 24 hours. You can send another one tomorrow.",
  review_not_confirmed: "Only a confirmed registration can be sent a review invite.",
  review_already_left: "That attendee has already left a review — nothing to invite.",
  review_event_not_ended: "Review invites go out after the event ends.",
  review_resend_failed: "Couldn't send the review invite. Try again, or check the email logs.",
  pattern_pass_holders: "Someone holds an all-sessions pass for this recurring event, so the repeat pattern can't be changed — a new pattern would create sessions they never bought. Refund those passes first.",
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
