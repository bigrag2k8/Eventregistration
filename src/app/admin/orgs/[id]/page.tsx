import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DeleteOrgCard } from "@/components/DeleteOrgCard";
import {
  PLANS,
  OVERRIDABLE_LIMITS,
  OverridableLimit,
  parseOverrides,
  effectivePlan,
} from "@/lib/plans";
import { editOrgSubscriptionAction, resetConnectAction, resyncSubscriptionAction, deleteOrgAction } from "./actions";

export const dynamic = "force-dynamic";

const PLAN_KEYS = ["FREE", "SINGLE_EVENT", "STARTER", "PRO", "ENTERPRISE"] as const;
const STATUS_KEYS = ["NONE", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE"] as const;

const LIMIT_LABELS: Record<OverridableLimit, string> = {
  monthlyEventLimit: "Events per month",
  registrationLimitPerEvent: "Registrations per event",
  emailCampaignsPerEvent: "Communication emails per event",
};

function fmtLimit(v: number | null): string {
  return v === null ? "Unlimited" : String(v);
}

export default async function AdminOrgPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string; connect_reset?: string; resynced?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: { _count: { select: { events: true, members: true } } },
  });
  if (!org || org.deletedAt) notFound();

  const overrides = parseOverrides(org.planOverrides);
  const catalog = PLANS[org.subscriptionPlan as keyof typeof PLANS] ?? PLANS.FREE;
  const effective = effectivePlan(org);

  const modeFor = (key: OverridableLimit): "default" | "unlimited" | "custom" => {
    if (!(key in overrides)) return "default";
    return overrides[key] === null ? "unlimited" : "custom";
  };

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-sm opacity-80 hover:opacity-100">◀ Admin overview</Link>
          <span className="font-semibold">Manage organization</span>
          <span />
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {searchParams?.saved && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Subscription updated.
          </div>
        )}
        {searchParams?.connect_reset && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Stripe Connect link cleared. This org can now re-onboard from its dashboard.
          </div>
        )}
        {searchParams?.resynced && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Subscription re-synced from Stripe — status is now <strong>{searchParams.resynced}</strong>.
          </div>
        )}

        {/* Identity */}
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{org.name}</h1>
              <p className="font-mono text-xs text-slate-500">{org.slug}</p>
              {org.contactEmail && <p className="mt-1 text-sm text-slate-600">{org.contactEmail}</p>}
              <p className="mt-1 text-sm">
                Payments:{" "}
                {org.stripeAccountChargesEnabled ? (
                  <span className="font-medium text-emerald-700">enabled</span>
                ) : (
                  <span className="font-medium text-amber-700">disabled ({org.stripeAccountStatus ?? "not_started"})</span>
                )}
              </p>
              {org.stripeAccountId && (
                <form action={resetConnectAction} className="mt-2">
                  <input type="hidden" name="orgId" value={org.id} />
                  <p className="font-mono text-[11px] text-slate-400">{org.stripeAccountId}</p>
                  <ConfirmButton
                    label="Reset Stripe Connect"
                    confirmText={`Clear this org's Stripe Connect link (${org.stripeAccountId})? It does NOT delete the Stripe account — it just lets the org re-onboard a fresh one. Use this when the stored account is orphaned (created under a different Stripe platform).`}
                    className="mt-1 text-xs text-red-600 hover:underline"
                  />
                </form>
              )}
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>{org._count.members} member{org._count.members === 1 ? "" : "s"}</div>
              <div>{org._count.events} event{org._count.events === 1 ? "" : "s"}</div>
              <Link href={`/o/${org.slug}`} target="_blank" className="text-brand-700 hover:underline">
                View public ↗
              </Link>
            </div>
          </div>
        </section>

        {/* Effective entitlements right now */}
        <section className="card">
          <h2 className="text-lg font-semibold">In force right now</h2>
          <p className="text-sm text-slate-500">
            What this org is actually entitled to (plan, minus any lapse, plus overrides).
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Readout label="Effective plan" value={effective.name} />
            <Readout label="Events / month" value={fmtLimit(effective.monthlyEventLimit)} />
            <Readout label="Registrations / event" value={fmtLimit(effective.registrationLimitPerEvent)} />
            <Readout label="Comm. emails / event" value={fmtLimit(effective.emailCampaignsPerEvent)} />
            <Readout label="Single-event credits" value={String(org.singleEventCredits)} />
            <Readout label="Status" value={org.subscriptionStatus} />
          </dl>
          {org.stripeSubscriptionId && (
            <form action={resyncSubscriptionAction} className="mt-4 flex items-center gap-3">
              <input type="hidden" name="orgId" value={org.id} />
              <button type="submit" className="text-sm font-medium text-brand-700 hover:underline">
                Re-sync from Stripe
              </button>
              <span className="text-xs text-slate-400">
                Pulls the live subscription status — use if it drifted (e.g. stuck INCOMPLETE).
              </span>
            </form>
          )}
        </section>

        {/* Editor */}
        <form action={editOrgSubscriptionAction} className="space-y-6">
          <input type="hidden" name="orgId" value={org.id} />

          <section className="card">
            <h2 className="text-lg font-semibold">Subscription</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Plan</label>
                <select name="subscriptionPlan" defaultValue={org.subscriptionPlan} className="input">
                  {PLAN_KEYS.map((k) => (
                    <option key={k} value={k}>{PLANS[k].name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="subscriptionStatus" defaultValue={org.subscriptionStatus} className="input">
                  {STATUS_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Single-event credits</label>
                <input
                  name="singleEventCredits"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={org.singleEventCredits}
                  className="input"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Setting a monthly plan’s status to anything other than ACTIVE/TRIALING (or PAST_DUE within the
              grace window) drops the org to Free limits — overrides below still apply on top.
            </p>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Per-org limit overrides</h2>
            <p className="text-sm text-slate-500">
              Leave a limit on <strong>Plan default</strong> to follow the catalog. Choose <strong>Unlimited</strong>{" "}
              or <strong>Custom</strong> to override it just for this org.
            </p>
            <div className="mt-4 space-y-4">
              {OVERRIDABLE_LIMITS.map((key) => {
                const current = overrides[key];
                return (
                  <div key={key} className="grid items-end gap-3 sm:grid-cols-[1fr_auto_8rem]">
                    <div>
                      <label className="label">{LIMIT_LABELS[key]}</label>
                      <select name={`${key}_mode`} defaultValue={modeFor(key)} className="input">
                        <option value="default">Plan default ({fmtLimit(catalog[key])})</option>
                        <option value="unlimited">Unlimited</option>
                        <option value="custom">Custom…</option>
                      </select>
                    </div>
                    <div className="hidden text-sm text-slate-400 sm:block">value →</div>
                    <div>
                      <input
                        name={`${key}_value`}
                        type="number"
                        min={0}
                        placeholder="number"
                        defaultValue={typeof current === "number" ? current : ""}
                        className="input"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              The number box is only used when the mode is set to <strong>Custom</strong>.
            </p>
          </section>

          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="btn-secondary">Cancel</Link>
            <button type="submit" className="btn-primary">Save changes</button>
          </div>
        </form>

        <DeleteOrgCard
          orgId={org.id}
          orgName={org.name}
          members={org._count.members}
          events={org._count.events}
          deleteAction={deleteOrgAction}
        />
      </div>
    </main>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
