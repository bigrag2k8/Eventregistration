import Link from "next/link";
import { prisma } from "@/lib/db";
import { canAcceptPayments } from "@/lib/connect";
import type { JwtPayload } from "@/lib/auth";

interface Props {
  session: JwtPayload;
}

/**
 * Persistent yellow banner shown across every dashboard page when the org
 * hasn't completed Stripe Connect onboarding. The goal is to put the
 * requirement directly in front of the organizer before they try to charge for
 * something and discover they can't — and to fail-fast at exactly one place
 * (Billing → Connect) rather than scatter the message across every paid surface.
 *
 * Hidden when:
 *  - The user is field staff (STAFF / VOLUNTEER) — they don't control billing.
 *  - The user has no org (rare; nothing to gate).
 *  - The org is already Connect-ready (charges enabled).
 */
export async function ConnectRequiredBanner({ session }: Props) {
  if (session.role === "STAFF" || session.role === "VOLUNTEER") return null;
  if (!session.orgId) return null;

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { stripeAccountId: true, stripeAccountChargesEnabled: true },
  });
  if (!org || canAcceptPayments(org)) return null;

  // Onboarding partially started (a Stripe account exists but charges aren't
  // enabled yet) gets a softer "finish setup" prompt vs. the never-started
  // "connect now" prompt.
  const partial = !!org.stripeAccountId;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-amber-700" aria-hidden>⚠</span>
          <div>
            <strong className="text-amber-900">
              {partial
                ? "Finish Stripe setup to accept payments"
                : "Connect Stripe to sell paid tickets"}
            </strong>
            <p className="mt-0.5 max-w-2xl text-amber-800">
              Hosting <strong>free events</strong> doesn&rsquo;t need this. To charge for tickets,
              run promo-coded paid events, or accept vendor booth payments, you need to{" "}
              {partial ? "finish Stripe Connect onboarding" : "connect your Stripe account"}
              {" "}first — it takes a few minutes.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings#payouts"
          className="whitespace-nowrap rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
        >
          {partial ? "Resume Stripe setup →" : "Connect Stripe →"}
        </Link>
      </div>
    </div>
  );
}
