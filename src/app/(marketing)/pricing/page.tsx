import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { PLATFORM_FEE_PERCENT, MIN_PLATFORM_FEE_CENTS, SERIES_FEE_CAP_PERCENT } from "@/lib/connect";

// Stripe's standard US card rate, mirrored from PROCESSING_FEE_PCT /
// PROCESSING_FEE_FIXED_CENTS in src/server/pricing.ts.
const STRIPE_FEE_LABEL = "2.9% + $0.30";

export const metadata = {
  title: "Pricing — Your Events App",
  description:
    "Free to start. $19 unlocks a full-featured event; $34.99 unlocks a whole recurring series. Flat 5% on sales — never over 10% on class drop-ins. No subscription.",
};

const TIERS = [
  {
    plan: PLANS.FREE,
    tagline: "Try the platform, no card required.",
    features: [
      "1 event per month",
      "1 recurring event (drop-in tickets)",
      "Up to 50 registrations per event",
      "1 email broadcast per event",
      "QR check-in & CSV export",
    ],
    cta: { label: "Get started free", href: "/signup" },
    featured: false,
  },
  {
    plan: PLANS.SINGLE_EVENT,
    tagline: "Pay once, unlock one full-featured event.",
    features: [
      "Unlimited registrations",
      "Custom branding (logo + colors)",
      "Vendor / booth applications",
      "Team invites & 3 email broadcasts",
      "QR check-in & CSV export",
    ],
    cta: { label: "Host an event", href: "/signup" },
    featured: true,
  },
  {
    plan: PLANS.SERIES_CREDIT,
    tagline: "Turn a class or course into one page that runs itself.",
    features: [
      "Every session auto-scheduled on one page",
      "Sell drop-ins or a all-sessions pass",
      "Unlimited registrations + your branding",
      "Cancel or reschedule any single session",
      `Class drop-in fees capped at ${SERIES_FEE_CAP_PERCENT}%`,
    ],
    cta: { label: "Start a recurring event", href: "/signup" },
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple, pay-as-you-go pricing</h1>
        <p className="mt-4 text-lg text-slate-600">
          Run unlimited free events. When you need the full feature set for an event, unlock it with a single payment — no subscription.
        </p>
        <p className="mt-3 text-slate-600">
          Running a weekly class or a multi-week course? A recurring event puts every session on one page —
          sell drop-ins or the whole thing at once.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map(({ plan, tagline, features, cta, featured }) => (
            <div
              key={plan.key}
              className={`card flex flex-col ${featured ? "ring-2 ring-brand-500" : ""}`}
            >
              {featured && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <div className="mt-2 text-3xl font-bold">{plan.price}</div>
              <p className="mt-2 text-sm text-slate-600">{tagline}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                {features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-brand-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={cta.href}
                className={`mt-6 ${featured ? "btn-primary" : "btn-secondary"} w-full`}
              >
                {cta.label}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Fees on paid ticket sales &amp; vendors</h2>
          <p className="mt-1 text-sm text-slate-600">
            The plan prices above are for hosting. When you sell paid tickets or collect vendor booth
            payments, the following per-transaction fees apply. Free events, $0 tickets, and free
            vendor booths are always fee-free.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
              <div className="text-2xl font-bold">
                {PLATFORM_FEE_PERCENT}%
                <span className="ml-1 text-base font-normal text-slate-500">
                  (${(MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)} min)
                </span>
              </div>
              <div className="mt-1 font-medium">Platform fee</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Per paid ticket or vendor booth, on the amount after any discounts — not on sales
                tax. A ${(MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)} minimum applies on small tickets
                so we stay net-positive after Stripe&apos;s processing cost. Deducted from your
                payout. It&apos;s how we keep hosting free events free.
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-brand-200">
              <div className="text-2xl font-bold">
                {PLATFORM_FEE_PERCENT}%
                <span className="ml-1 text-base font-normal text-slate-500">
                  (never over {SERIES_FEE_CAP_PERCENT}%)
                </span>
              </div>
              <div className="mt-1 font-medium">Class drop-in fee</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                On recurring class sessions, the ${(MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)} minimum
                is capped at {SERIES_FEE_CAP_PERCENT}% of the ticket. A $5 drop-in costs you $0.50,
                not ${(MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)} — so cheap classes stay cheap. Sell
                the all-sessions pass and it&apos;s a flat {PLATFORM_FEE_PERCENT}%.
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
              <div className="text-2xl font-bold">{STRIPE_FEE_LABEL}</div>
              <div className="mt-1 font-medium">Stripe processing fee</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Stripe&apos;s standard card rate, per paid order. By default it&apos;s covered within the
                platform fee; you can optionally pass it on to attendees at checkout.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-slate-600">
          <span className="font-medium text-slate-800">Buyer protection built in:</span>{" "}
          attendee funds are protected until your event happens — if an event is cancelled,
          refunds are guaranteed.
        </p>

        <p className="mt-6 text-center text-sm text-slate-500">
          Curious how this stacks up against Eventbrite?{" "}
          <Link href="/compare" className="font-medium text-brand-700 hover:underline">
            See the side-by-side comparison
          </Link>
          .
        </p>

        <p className="mt-3 text-center text-sm text-slate-500">
          Need higher volume or custom terms?{" "}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Contact us
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
