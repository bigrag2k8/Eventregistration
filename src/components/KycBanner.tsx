import Link from "next/link";

interface Props {
  kycStatus: string | null;
  payoutsEnabled: boolean;
  hasSoldTicket: boolean;
  pendingPayoutCents?: number;
}

/**
 * Shows on the dashboard overview when the organizer has revenue waiting
 * but Stripe payouts aren't enabled yet. Deferred-KYC by design — they
 * could publish events and sell tickets before completing onboarding;
 * this nudge tells them they need to finish to actually get paid.
 */
export function KycBanner({ kycStatus, payoutsEnabled, hasSoldTicket, pendingPayoutCents = 0 }: Props) {
  if (payoutsEnabled) return null;

  // Tier the urgency by how much money is waiting + onboarding stage
  const isUrgent = pendingPayoutCents >= 10_000; // $100+ waiting
  const isPending = kycStatus === "pending_review";
  const isRestricted = kycStatus === "restricted";

  let title: string;
  let body: string;
  if (isRestricted) {
    title = "⚠ Stripe needs more info to pay you out";
    body = "Your Stripe account is restricted. Click below to see what's required.";
  } else if (isPending) {
    title = "⏳ Stripe is reviewing your account";
    body = "Stripe is verifying your details. Most reviews finish in under 24 hours.";
  } else if (hasSoldTicket) {
    // hasSoldTicket means PAID revenue exists — we only get here when
    // the org has actual money waiting to settle.
    title = "🎉 You sold your first paid ticket! Set up payouts to get paid.";
    body = isUrgent
      ? `You have $${(pendingPayoutCents / 100).toFixed(2)} waiting. Finish payout setup so Stripe can deposit it.`
      : "Takes about 90 seconds. Stripe holds the funds until you finish.";
  } else {
    return null; // No revenue and not in-progress with KYC: don't nag
  }

  const accent = isRestricted ? "red" : isPending ? "amber" : "brand";

  return (
    <div
      className={
        accent === "red"
          ? "rounded-xl border-2 border-red-300 bg-red-50 p-4"
          : accent === "amber"
          ? "rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
          : "rounded-xl border-2 border-brand-300 bg-brand-50 p-4"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-700">{body}</p>
        </div>
        {!isPending && (
          <Link href="/dashboard/settings#payouts" className="btn-primary whitespace-nowrap">
            {isRestricted ? "Resolve in Stripe →" : "Set up payouts →"}
          </Link>
        )}
      </div>
    </div>
  );
}
