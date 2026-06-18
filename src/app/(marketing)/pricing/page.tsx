import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = {
  title: "Pricing — Your Events App",
  description: "Free to start. Pay $19 once to unlock a full-featured event. No subscription.",
};

const TIERS = [
  {
    plan: PLANS.FREE,
    tagline: "Try the platform, no card required.",
    features: [
      "1 event per month",
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
];

export default function PricingPage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple, pay-as-you-go pricing</h1>
        <p className="mt-4 text-lg text-slate-600">
          Run unlimited free events. When you need the full feature set for an event, unlock it with a single payment — no subscription.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="grid gap-6 sm:grid-cols-2">
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

        <p className="mt-8 text-center text-sm text-slate-500">
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
