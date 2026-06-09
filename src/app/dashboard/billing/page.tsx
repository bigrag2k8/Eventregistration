import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { PLANS, PlanInfo } from "@/lib/plans";
import { SignOutButton } from "@/components/SignOutButton";
import { BillingActions } from "@/components/BillingActions";
import { activateFreePlanAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { upgraded?: string; canceled?: string; welcome?: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) redirect("/dashboard");

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/dashboard");

  const isFirstTime = !org.planSelected;

  const currentPlan = PLANS[org.subscriptionPlan as keyof typeof PLANS] ?? PLANS.FREE;

  // Usage stats: events created in current month
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const eventsThisMonth = await prisma.event.count({
    where: { organizationId: org.id, deletedAt: null, createdAt: { gte: startOfMonth } },
  });

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Billing</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {isFirstTime && (
          <div className="rounded-xl bg-brand-50 p-5 ring-1 ring-brand-200">
            <h2 className="text-lg font-semibold text-brand-900">👋 Welcome to Your Events App!</h2>
            <p className="mt-1 text-sm text-brand-800">
              Pick a plan below to activate your account. You can start with <strong>Free</strong> at no cost,
              or pick a paid plan for more events and full branding. You won't be able to create events until you choose a plan.
            </p>
          </div>
        )}
        {searchParams.upgraded && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ You're now on the <strong>{PLANS[searchParams.upgraded as keyof typeof PLANS]?.name ?? searchParams.upgraded}</strong> plan. Welcome!
          </div>
        )}
        {searchParams.canceled && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
            Checkout was canceled. No charge was made.
          </div>
        )}

        {/* Current plan banner */}
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Current plan</div>
              <h1 className="mt-1 text-3xl font-bold">{currentPlan.name}</h1>
              <p className="mt-1 text-slate-600">{currentPlan.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                <span>Status: <strong className="text-slate-700">{org.subscriptionStatus}</strong></span>
                {org.subscriptionCurrentPeriodEnd && (
                  <span>
                    {org.subscriptionCancelAtPeriodEnd ? "Cancels on" : "Renews on"}{" "}
                    <strong className="text-slate-700">{org.subscriptionCurrentPeriodEnd.toLocaleDateString()}</strong>
                  </span>
                )}
                {org.singleEventCredits > 0 && (
                  <span>Single-event credits: <strong className="text-slate-700">{org.singleEventCredits}</strong></span>
                )}
              </div>
            </div>
            <BillingActions
              currentPlan={org.subscriptionPlan}
              hasStripeSubscription={!!org.stripeSubscriptionId}
            />
          </div>

          {/* Usage */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Stat
              label="Events this month"
              value={`${eventsThisMonth}${currentPlan.monthlyEventLimit ? ` / ${currentPlan.monthlyEventLimit}` : ""}`}
              warn={currentPlan.monthlyEventLimit !== null && eventsThisMonth >= currentPlan.monthlyEventLimit}
            />
            <Stat
              label="Plan features"
              value={`${Object.values(currentPlan.features).filter(Boolean).length} of ${Object.values(currentPlan.features).length}`}
            />
          </div>
        </section>

        {/* Plan comparison */}
        <section>
          <h2 className="text-xl font-bold">Plans</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            {(["FREE", "SINGLE_EVENT", "STARTER", "PRO"] as const).map((key) => {
              const plan = PLANS[key];
              const isCurrent = org.subscriptionPlan === key;
              return <PlanCard key={key} plan={plan} isCurrent={isCurrent} />;
            })}
          </div>
          <div className="mt-4">
            <EnterpriseCard />
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ring-1 ${warn ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${warn ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      {warn && <div className="mt-1 text-xs text-amber-700">Approaching plan limit — consider upgrading.</div>}
    </div>
  );
}

function PlanCard({ plan, isCurrent }: { plan: PlanInfo; isCurrent: boolean }) {
  return (
    <div className={`flex flex-col rounded-xl bg-white p-5 ring-1 ${isCurrent ? "ring-2 ring-brand-500" : "ring-slate-200"}`}>
      <div className="text-lg font-semibold">{plan.name}</div>
      <div className="mt-1 text-2xl font-bold">{plan.price}</div>
      <p className="mt-2 text-sm text-slate-600 flex-1">{plan.blurb}</p>

      <ul className="mt-4 space-y-1 text-sm text-slate-600">
        {plan.monthlyEventLimit !== null
          ? <li>📅 Up to {plan.monthlyEventLimit} event{plan.monthlyEventLimit > 1 ? "s" : ""}{plan.cadence === "monthly" ? "/month" : ""}</li>
          : <li>📅 Unlimited events</li>}
        {plan.registrationLimitPerEvent !== null
          ? <li>👥 Up to {plan.registrationLimitPerEvent} registrations per event</li>
          : <li>👥 Unlimited registrations</li>}
        <FeatureLi on={plan.features.customBranding} label="Custom branding (logo, color, email)" />
        <FeatureLi on={plan.features.vendorFlow} label="Vendor application flow" />
        <FeatureLi on={plan.features.teamInvites} label="Team invites + per-event assignments" />
        <FeatureLi on={plan.features.csvExport} label="CSV exports" />
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <span className="block rounded-lg bg-brand-100 px-3 py-2 text-center text-sm font-medium text-brand-700">Current plan</span>
        ) : (
          <UpgradeButton planKey={plan.key} cadence={plan.cadence} />
        )}
      </div>
    </div>
  );
}

function FeatureLi({ on, label }: { on: boolean; label: string }) {
  return <li className={on ? "" : "text-slate-400"}>{on ? "✓" : "—"} {label}</li>;
}

function UpgradeButton({ planKey, cadence }: { planKey: string; cadence: string }) {
  // Free plan: activate without Stripe
  if (planKey === "FREE") {
    return (
      <form action={activateFreePlanAction}>
        <button type="submit" className="btn-primary w-full">
          Start with Free
        </button>
      </form>
    );
  }
  return (
    <form action="/api/billing/checkout" method="POST">
      <input type="hidden" name="planKey" value={planKey} />
      <button type="submit" className="btn-primary w-full">
        {cadence === "one_time" ? "Buy event credit" : "Choose plan"}
      </button>
    </form>
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
