import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session?.orgId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">No organization linked</h1>
        <p className="mt-2 text-slate-600">Ask your admin to add you to an organization.</p>
      </main>
    );
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, totalRevenue, totalRegs, checkInRate] = await Promise.all([
    prisma.event.findMany({
      where: { organizationId: session.orgId, deletedAt: null },
      orderBy: { startAt: "desc" },
      take: 12,
      include: {
        _count: { select: { registrations: true } },
        ticketTypes: true,
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: "SUCCEEDED",
        createdAt: { gte: since },
        registration: { event: { organizationId: session.orgId } },
      },
      _sum: { amountCents: true },
    }),
    prisma.registration.count({
      where: {
        status: "CONFIRMED",
        createdAt: { gte: since },
        event: { organizationId: session.orgId },
      },
    }),
    (async () => {
      const total = await prisma.ticket.count({
        where: { registration: { status: "CONFIRMED", event: { organizationId: session.orgId } } },
      });
      const checked = await prisma.checkIn.count({
        where: { event: { organizationId: session.orgId } },
      });
      return total === 0 ? 0 : Math.round((checked / total) * 100);
    })(),
  ]);

  return (
    <DashboardShell role={session.role}>
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="text-sm text-slate-500">Last 30 days</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={money(totalRevenue._sum.amountCents ?? 0)} />
        <Stat label="Registrations" value={String(totalRegs)} />
        <Stat label="Check-in rate" value={`${checkInRate}%`} />
        <Stat label="Events" value={String(events.length)} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your events</h2>
        {session.role !== "STAFF" && (
          <Link href="/dashboard/events/new" className="btn-primary">+ Create event</Link>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Registrations</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {e.startAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{e.status}</span>
                </td>
                <td className="px-4 py-3 text-right">{e._count.registrations}</td>
                <td className="px-4 py-3 text-right">
                  {session.role === "STAFF" ? (
                    <Link href={`/checkin/${e.id}`} className="text-brand-700 hover:underline">Open scanner</Link>
                  ) : (
                    <>
                      <Link href={`/dashboard/events/${e.id}`} className="text-brand-700 hover:underline">Manage</Link>
                      <span className="px-2 text-slate-300">·</span>
                      <Link href={`/checkin/${e.id}`} className="text-brand-700 hover:underline">Check-in</Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function DashboardShell({ children, role }: { children: React.ReactNode; role: string }) {
  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-bold text-brand-700">Automated I.T. Solutions Events APP</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard">Overview</Link>
            {role !== "STAFF" && <Link href="/dashboard/events/new">+ New event</Link>}
            {role === "STAFF" && <Link href="/checkin">Scanner</Link>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{role}</span>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-8">{children}</section>
    </main>
  );
}
