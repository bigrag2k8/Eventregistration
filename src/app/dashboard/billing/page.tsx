import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { activateFreePlanAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { upgraded?: string; canceled?: string; welcome?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/dashboard");

  const isFirstTime = !org.planSelected;
  const credits = org.singleEventCredits;

  // Count how many of this org's events are already premium (credits spent).
  const premiumEvents = await prisma.event.count({
    where: { organizationId: org.id, deletedAt: null, isPremium: true },
  });

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Billing</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {isFirstTime && (
          <div className="rounded-xl bg-brand-50 p-5 ring-1 ring-brand-200">
            <h2 className="text-lg font-semibold text-brand-900">👋 Welcome to Your Events App!</h2>
            <p className="mt-1 text-sm text-brand-800">
              You can create <strong>unlimited free events</strong> at no cost. When you want unlimited
              registrations, vendor applications, and custom branding for an event, buy a
              <strong> single-event credit</strong> and apply it to that event. Start free below.
            </p>
            <form action={activateFreePlanAction} className="mt-3">
              <button type="submit" className="btn-primary">Get started — it&rsquo;s free</button>
            </form>
          </div>
        )}
        {searchParams.upgraded && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {searchParams.upgraded === "SINGLE_EVENT" ? (
              <>
                ✓ Single-event credit added — you now have <strong>{credits}</strong>{" "}
                credit{credits === 1 ? "" : "s"}. Apply it when you create an event (or upgrade a free
                one) to unlock unlimited registrations, vendors, and branding.
              </>
            ) : (
              <>✓ You&rsquo;re all set. Welcome!</>
            )}
          </div>
        )}
        {searchParams.canceled && (() => {
          // Distinct messages so the cause isn't hidden behind a generic
          // "canceled". `invalid_plan` and `stripe_error` are real config bugs
          // — surfacing them tells the organizer (and support) what to fix.
          const code = searchParams.canceled;
          const MAP: Record<string, { tone: "amber" | "red"; body: React.ReactNode }> = {
            "1": { tone: "amber", body: <>Checkout was canceled. No charge was made.</> },
            invalid_plan: {
              tone: "red",
              body: (
                <>
                  <strong>We couldn&rsquo;t start checkout.</strong> The selected plan isn&rsquo;t configured correctly
                  (the Stripe price ID is missing or empty). Contact support — this is a server-side configuration
                  issue, not something you did wrong.
                </>
              ),
            },
            stripe_error: {
              tone: "red",
              body: (
                <>
                  <strong>Stripe didn&rsquo;t accept the request.</strong> The price ID may belong to a different
                  Stripe account, or the account isn&rsquo;t set up to accept payments yet. Contact support.
                </>
              ),
            },
            existing_subscription: {
              tone: "amber",
              body: <>You already have an active subscription. Manage it from the existing billing area.</>,
            },
          };
          const m = MAP[code] ?? MAP["1"];
          const cls = m.tone === "red"
            ? "rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200"
            : "rounded-lg bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200";
          return <div className={cls}>{m.body}</div>;
        })()}

        {/* Event credits */}
        <section className="card flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-wider text-slate-500">Event credits</div>
            <div className="mt-1 text-4xl font-bold">{credits}</div>
            <p className="mt-2 text-slate-600">
              Each credit turns one event into a <strong>Single Event</strong> — unlimited registrations,
              vendor applications, custom branding, and 5 email broadcasts. Spend it when you create an
              event, or upgrade a free event later. Credits don&rsquo;t expire.
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
              <span>Premium events created: <strong className="text-slate-700">{premiumEvents}</strong></span>
            </div>
          </div>
          <form action="/api/billing/checkout" method="POST">
            <input type="hidden" name="planKey" value="SINGLE_EVENT" />
            <button type="submit" className="btn-primary">Buy single event credit — $19</button>
          </form>
        </section>

        {/* Series credits */}
        <section className="card flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-wider text-slate-500">Series credits</div>
            <div className="mt-1 text-4xl font-bold">{org.seriesCredits}</div>
            <p className="mt-2 text-slate-600">
              Each credit makes one <strong>recurring series</strong> premium — every session gets unlimited
              registrations, custom branding, and 5 email broadcasts, and you can sell the{" "}
              <strong>full-series pass</strong> (one checkout for all sessions). The free plan includes one
              active drop-in-only series. Credits don&rsquo;t expire.
            </p>
          </div>
          <form action="/api/billing/checkout" method="POST">
            <input type="hidden" name="planKey" value="SERIES_CREDIT" />
            <button type="submit" className="btn-primary">Buy series credit — $34.99</button>
          </form>
        </section>

        {/* How pricing works */}
        <section>
          <h2 className="text-xl font-bold">How pricing works</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PricingCard
              title="Free event"
              price="$0"
              blurb="Run as many as you like — great for small or casual events."
              features={[
                ["Unlimited free events", true],
                ["Up to 50 registrations per event", true],
                ["1 email broadcast per event", true],
                ["QR tickets, check-in, CSV export", true],
                ["Vendor applications", false],
                ["Custom branding (logo + color)", false],
                ["Unlimited registrations", false],
              ]}
              cta={
                <form action={activateFreePlanAction} className="mt-4">
                  <button type="submit" className="btn-secondary w-full">Get started — it&rsquo;s free</button>
                </form>
              }
            />
            <PricingCard
              title="Single Event"
              price="$19 / event"
              highlight
              blurb="One credit unlocks one event's full power. No subscription."
              features={[
                ["Unlimited registrations", true],
                ["Vendor application flow", true],
                ["Custom branding (logo + color)", true],
                ["5 email broadcasts per event", true],
                ["Team invites + per-event roles", true],
                ["QR tickets, check-in, CSV export", true],
                ["Pay only when you need it — credits don't expire", true],
              ]}
              cta={
                <form action="/api/billing/checkout" method="POST" className="mt-4">
                  <input type="hidden" name="planKey" value="SINGLE_EVENT" />
                  <button type="submit" className="btn-primary w-full">Buy single event — $19</button>
                </form>
              }
            />
          </div>
          <div className="mt-4">
            <EnterpriseCard />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Standard payment processing fee applies to paid tickets. Running lots of events?{" "}
            <a href="mailto:events@yourevents.app?subject=Volume%20pricing" className="text-brand-700 hover:underline">Ask about volume pricing</a>.
          </p>
        </section>
      </div>
    </main>
  );
}

function PricingCard({
  title, price, blurb, features, highlight, cta,
}: {
  title: string;
  price: string;
  blurb: string;
  features: [string, boolean][];
  highlight?: boolean;
  cta?: ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded-xl bg-white p-5 ring-1 ${highlight ? "ring-2 ring-brand-500" : "ring-slate-200"}`}>
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-2xl font-bold">{price}</div>
      <p className="mt-2 text-sm text-slate-600">{blurb}</p>
      <ul className="mt-4 space-y-1 text-sm">
        {features.map(([label, on]) => (
          <li key={label} className={on ? "text-slate-700" : "text-slate-400"}>
            {on ? "✓" : "—"} {label}
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}

function EnterpriseCard() {
  return (
    <div className="rounded-xl bg-slate-900 p-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Enterprise</div>
          <p className="mt-1 text-sm opacity-80">{PLANS.ENTERPRISE.blurb}</p>
        </div>
        <a href="mailto:events@yourevents.app?subject=Enterprise%20plan%20inquiry"
           className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">
          Contact us
        </a>
      </div>
    </div>
  );
}
