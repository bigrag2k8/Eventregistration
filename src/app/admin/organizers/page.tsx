import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const PLAN_KEYS = ["FREE", "SINGLE_EVENT", "STARTER", "PRO", "ENTERPRISE"] as const;
const STATUS_KEYS = ["NONE", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE"] as const;
const CONNECT_KEYS = ["any", "enabled", "disabled", "none"] as const;

type SearchParams = {
  q?: string;
  plan?: string;
  status?: string;
  connect?: string;
  page?: string;
};

function buildWhere(sp: SearchParams): Prisma.OrganizationWhereInput {
  const where: Prisma.OrganizationWhereInput = { deletedAt: null };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.plan && (PLAN_KEYS as readonly string[]).includes(sp.plan)) {
    where.subscriptionPlan = sp.plan as (typeof PLAN_KEYS)[number];
  }
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.subscriptionStatus = sp.status as (typeof STATUS_KEYS)[number];
  }
  if (sp.connect === "enabled") where.stripeAccountChargesEnabled = true;
  else if (sp.connect === "disabled") {
    where.AND = [
      { stripeAccountId: { not: null } },
      { stripeAccountChargesEnabled: false },
    ];
  } else if (sp.connect === "none") where.stripeAccountId = null;

  return where;
}

export default async function AdminOrganizersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const page = Math.max(1, parseInt(searchParams.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const where = buildWhere(searchParams);

  const [orgs, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: { _count: { select: { events: true, members: true } } },
    }),
    prisma.organization.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportQs = new URLSearchParams();
  if (searchParams.q) exportQs.set("q", searchParams.q);
  if (searchParams.plan) exportQs.set("plan", searchParams.plan);
  if (searchParams.status) exportQs.set("status", searchParams.status);
  if (searchParams.connect) exportQs.set("connect", searchParams.connect);
  const exportHref = `/api/admin/organizers/export.csv${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  const hasFilter =
    !!searchParams.q ||
    !!searchParams.plan ||
    !!searchParams.status ||
    !!searchParams.connect;

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="text-slate-500">/</span>
            <span className="font-semibold">Organizers</span>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="opacity-80 hover:opacity-100">Overview</Link>
            <Link href="/admin/organizers">Organizers</Link>
            <Link href="/admin/vendors" className="opacity-80 hover:opacity-100">Vendors</Link>
            <Link href="/admin/attendees" className="opacity-80 hover:opacity-100">Attendees</Link>
            <Link href="/admin/financials" className="opacity-80 hover:opacity-100">Financials</Link>
            <Link href="/admin/audit" className="opacity-80 hover:opacity-100">Audit log</Link>
            <SignOutButton className="text-sm opacity-80 hover:text-red-300" />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Organizers</h1>
            <p className="text-sm text-slate-500">
              All organizations on the platform. {total.toLocaleString()} result{total === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex gap-2">
            <a href={exportHref} className="btn-secondary">Export CSV</a>
            <Link href="/admin/orgs/new" className="btn-primary">+ Invite organization</Link>
          </div>
        </div>

        <form className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Search</label>
            <input
              name="q"
              defaultValue={searchParams.q ?? ""}
              className="input"
              placeholder="Name, slug, or contact email"
            />
          </div>
          <div>
            <label className="label">Plan</label>
            <select name="plan" defaultValue={searchParams.plan ?? ""} className="input">
              <option value="">All plans</option>
              {PLAN_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={searchParams.status ?? ""} className="input">
              <option value="">All statuses</option>
              {STATUS_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Stripe Connect</label>
            <select name="connect" defaultValue={searchParams.connect ?? ""} className="input">
              <option value="">Any</option>
              <option value="enabled">Enabled (can charge)</option>
              <option value="disabled">Onboarding incomplete</option>
              <option value="none">Not started</option>
            </select>
          </div>
          <button type="submit" className="btn-secondary">Filter</button>
          {hasFilter && (
            <Link href="/admin/organizers" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
          )}
        </form>

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payments</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.name}</div>
                    <div className="font-mono text-xs text-slate-500">{o.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {o.contactEmail ? (
                      <a href={`mailto:${o.contactEmail}`} className="hover:underline">{o.contactEmail}</a>
                    ) : <span className="text-slate-400">—</span>}
                    {o.contactPhone ? (
                      <div className="text-xs text-slate-500">{o.contactPhone}</div>
                    ) : (
                      <div className="text-xs text-amber-700">no phone</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {o.addressLine1 ? (
                      <>
                        <div>{o.addressLine1}</div>
                        {o.addressLine2 && <div>{o.addressLine2}</div>}
                        <div>
                          {[o.city, o.state, o.zipCode].filter(Boolean).join(", ")}
                        </div>
                        {o.country && <div className="text-slate-500">{o.country}</div>}
                      </>
                    ) : (
                      <span className="text-amber-700">no address</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{o.subscriptionPlan}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <span
                      className={
                        o.subscriptionStatus === "PAST_DUE"
                          ? "text-amber-700 font-semibold"
                          : o.subscriptionStatus === "ACTIVE" || o.subscriptionStatus === "TRIALING"
                          ? "text-emerald-700"
                          : "text-slate-500"
                      }
                    >
                      {o.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.stripeAccountChargesEnabled ? (
                      <span className="text-emerald-700">enabled</span>
                    ) : o.stripeAccountId ? (
                      <span className="text-amber-700">incomplete</span>
                    ) : (
                      <span className="text-slate-400">not started</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{o._count.members}</td>
                  <td className="px-4 py-3 text-right">{o._count.events}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {o.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      <Link href={`/admin/orgs/${o.id}`} className="font-medium text-brand-700 hover:underline">
                        Manage
                      </Link>
                      <Link href={`/o/${o.slug}`} target="_blank" className="text-slate-500 hover:underline">
                        View ↗
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">No organizations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} of {totalPages} · {total.toLocaleString()} organizations</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ pathname: "/admin/organizers", query: { ...searchParams, page: page - 1 } }}
                  className="btn-secondary"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ pathname: "/admin/organizers", query: { ...searchParams, page: page + 1 } }}
                  className="btn-secondary"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
