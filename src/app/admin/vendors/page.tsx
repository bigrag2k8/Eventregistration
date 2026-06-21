import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_KEYS = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAID",
  "REFUNDED",
  "WITHDRAWN",
] as const;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
  PAID: "bg-emerald-100 text-emerald-700",
  REFUNDED: "bg-slate-100 text-slate-600",
  WITHDRAWN: "bg-slate-100 text-slate-600",
};

type SearchParams = {
  q?: string;
  orgId?: string;
  eventId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
};

function buildWhere(sp: SearchParams): Prisma.VendorApplicationWhereInput {
  const where: Prisma.VendorApplicationWhereInput = {};

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contactFirstName: { contains: q, mode: "insensitive" } },
      { contactLastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.orgId) where.event = { organizationId: sp.orgId };
  if (sp.eventId) where.eventId = sp.eventId;
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.status = sp.status as (typeof STATUS_KEYS)[number];
  }
  if (sp.from && DATE_RE.test(sp.from)) {
    where.submittedAt = { ...(where.submittedAt as object), gte: new Date(sp.from) };
  }
  if (sp.to && DATE_RE.test(sp.to)) {
    const end = new Date(sp.to);
    end.setUTCDate(end.getUTCDate() + 1);
    where.submittedAt = { ...(where.submittedAt as object), lt: end };
  }

  return where;
}

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AdminVendorsPage({
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

  const [vendors, total, orgs, events] = await Promise.all([
    prisma.vendorApplication.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            slug: true,
            startAt: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.vendorApplication.count({ where }),
    prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    searchParams.orgId
      ? prisma.event.findMany({
          where: { organizationId: searchParams.orgId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { startAt: "desc" },
        })
      : prisma.event.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { startAt: "desc" },
          take: 200,
        }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportQs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "page") exportQs.set(k, v);
  }
  const exportHref = `/api/admin/vendors/export.csv${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  const hasFilter =
    !!searchParams.q ||
    !!searchParams.orgId ||
    !!searchParams.eventId ||
    !!searchParams.status ||
    !!searchParams.from ||
    !!searchParams.to;

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="text-slate-500">/</span>
            <span className="font-semibold">Vendors</span>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="opacity-80 hover:opacity-100">Overview</Link>
            <Link href="/admin/organizers" className="opacity-80 hover:opacity-100">Organizers</Link>
            <Link href="/admin/vendors">Vendors</Link>
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
            <h1 className="text-2xl font-bold">Vendors</h1>
            <p className="text-sm text-slate-500">
              Every vendor application across every event. {total.toLocaleString()} result{total === 1 ? "" : "s"}.
            </p>
          </div>
          <a href={exportHref} className="btn-secondary">Export CSV</a>
        </div>

        <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="label">Search</label>
            <input
              name="q"
              defaultValue={searchParams.q ?? ""}
              className="input"
              placeholder="Company, contact, email, phone"
            />
          </div>
          <div>
            <label className="label">Organization</label>
            <select name="orgId" defaultValue={searchParams.orgId ?? ""} className="input">
              <option value="">All organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Event</label>
            <select name="eventId" defaultValue={searchParams.eventId ?? ""} className="input">
              <option value="">All events</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" name="from" defaultValue={searchParams.from ?? ""} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" name="to" defaultValue={searchParams.to ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={searchParams.status ?? ""} className="input">
              <option value="">All statuses</option>
              {STATUS_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-secondary">Filter</button>
            {hasFilter && (
              <Link href="/admin/vendors" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
            )}
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Quoted</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{v.companyName}</div>
                    {v.productCategory && (
                      <div className="text-xs text-slate-500">{v.productCategory}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{`${v.contactFirstName} ${v.contactLastName}`.trim()}</div>
                    <a href={`mailto:${v.email}`} className="text-xs text-slate-500 hover:underline">{v.email}</a>
                    {v.phone && <div className="text-xs text-slate-500">{v.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {v.addressLine1 ? (
                      <>
                        <div>{v.addressLine1}</div>
                        {v.addressLine2 && <div>{v.addressLine2}</div>}
                        <div>{[v.city, v.state, v.zipCode].filter(Boolean).join(", ")}</div>
                        {v.country && <div className="text-slate-500">{v.country}</div>}
                      </>
                    ) : (
                      <span className="text-amber-700">no address</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orgs/${v.event.organization.id}`} className="text-brand-700 hover:underline">
                      {v.event.organization.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate" title={v.event.name}>{v.event.name}</div>
                    <div className="text-xs text-slate-500">{v.event.startAt.toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${STATUS_STYLES[v.status]}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{fmtMoney(v.quotedPriceCents)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {v.submittedAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/vendors/${v.id}/edit`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">No vendors match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} of {totalPages} · {total.toLocaleString()} vendors</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ pathname: "/admin/vendors", query: { ...searchParams, page: page - 1 } }}
                  className="btn-secondary"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ pathname: "/admin/vendors", query: { ...searchParams, page: page + 1 } }}
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
