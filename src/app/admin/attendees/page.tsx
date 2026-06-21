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
  "CONFIRMED",
  "PENDING",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

type SearchParams = {
  q?: string;
  orgId?: string;
  eventId?: string;
  status?: string;
  from?: string;
  to?: string;
  checkedIn?: string;
  page?: string;
};

function buildWhere(sp: SearchParams): Prisma.RegistrationWhereInput {
  const where: Prisma.RegistrationWhereInput = { deletedAt: null };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.orgId) where.event = { organizationId: sp.orgId };
  if (sp.eventId) where.eventId = sp.eventId;
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.status = sp.status as (typeof STATUS_KEYS)[number];
  } else if (!sp.status) {
    where.status = { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] };
  }

  if (sp.from && DATE_RE.test(sp.from)) {
    where.createdAt = { ...(where.createdAt as object), gte: new Date(sp.from) };
  }
  if (sp.to && DATE_RE.test(sp.to)) {
    const end = new Date(sp.to);
    end.setUTCDate(end.getUTCDate() + 1);
    where.createdAt = { ...(where.createdAt as object), lt: end };
  }

  return where;
}

function fmtMoney(cents: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "";
  return sym + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AdminAttendeesPage({
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

  const [regs, total, orgs, events] = await Promise.all([
    prisma.registration.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
        ticketType: { select: { name: true } },
        tickets: { select: { id: true, checkIn: { select: { id: true } } } },
      },
    }),
    prisma.registration.count({ where }),
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
  const exportHref = `/api/admin/attendees/export.csv${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

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
            <span className="font-semibold">Attendees</span>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="opacity-80 hover:opacity-100">Overview</Link>
            <Link href="/admin/organizers" className="opacity-80 hover:opacity-100">Organizers</Link>
            <Link href="/admin/attendees">Attendees</Link>
            <Link href="/admin/financials" className="opacity-80 hover:opacity-100">Financials</Link>
            <Link href="/admin/audit" className="opacity-80 hover:opacity-100">Audit log</Link>
            <SignOutButton className="text-sm opacity-80 hover:text-red-300" />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Attendees</h1>
            <p className="text-sm text-slate-500">
              Every registration across every organization. {total.toLocaleString()} result{total === 1 ? "" : "s"}.
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
              placeholder="Name, email, phone, company"
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
              <option value="">Confirmed + Partial refunds (default)</option>
              {STATUS_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-secondary">Filter</button>
            {hasFilter && (
              <Link href="/admin/attendees" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
            )}
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Attendee</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regs.map((r) => {
                const fullName = `${r.firstName} ${r.lastName}`.trim();
                const checkedTickets = r.tickets.filter((t) => t.checkIn);
                const checkLabel =
                  r.tickets.length === 0
                    ? "—"
                    : checkedTickets.length === r.tickets.length
                    ? "yes"
                    : checkedTickets.length === 0
                    ? "no"
                    : `${checkedTickets.length}/${r.tickets.length}`;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{fullName}</div>
                      {r.company && <div className="text-xs text-slate-500">{r.company}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a>
                      {r.phone && <div className="text-xs text-slate-500">{r.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orgs/${r.event.organization.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {r.event.organization.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate" title={r.event.name}>{r.event.name}</div>
                      <div className="text-xs text-slate-500">
                        {r.event.startAt.toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.ticketType.name}</td>
                    <td className="px-4 py-3 text-right">{r.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtMoney(r.totalCents, r.currency)}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span
                        className={
                          r.status === "CONFIRMED"
                            ? "text-emerald-700"
                            : r.status === "REFUNDED" || r.status === "PARTIALLY_REFUNDED"
                            ? "text-amber-700"
                            : r.status === "CANCELLED"
                            ? "text-red-700"
                            : "text-slate-500"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{checkLabel}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap" title={r.createdAt.toISOString()}>
                      {r.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
              {regs.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">No attendees match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} of {totalPages} · {total.toLocaleString()} registrations</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ pathname: "/admin/attendees", query: { ...searchParams, page: page - 1 } }}
                  className="btn-secondary"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ pathname: "/admin/attendees", query: { ...searchParams, page: page + 1 } }}
                  className="btn-secondary"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400">
          The default view shows CONFIRMED and PARTIALLY_REFUNDED registrations. To include pending or cancelled
          orders, change the status filter.
        </p>
      </div>
    </main>
  );
}
