import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, orgScope } from "@/lib/auth";
import { KycBanner } from "@/components/KycBanner";
import { money } from "@/lib/format";
import { requirePlanSelected } from "@/lib/plan-gate";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"];

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/signin");
  // Gate on staff ROLE, not org-presence: an attendee with a stray
  // organizationId must never reach the org-scoped queries below. Their home
  // is /account. (Middleware also bounces them, this is defense in depth.)
  if (!STAFF_ROLES.includes(session.role)) redirect("/account");
  // SUPERADMIN doesn't need an org link — they can view everything.
  if (!session.orgId && session.role !== "SUPERADMIN") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">No organization linked</h1>
        <p className="mt-2 text-slate-600">Ask your admin to add you to an organization.</p>
      </main>
    );
  }
  if (session.role !== "SUPERADMIN") await requirePlanSelected(session);

  const isSuper = session.role === "SUPERADMIN";
  const org = session.orgId
    ? await prisma.organization.findUnique({ where: { id: session.orgId } })
    : null;
  const eventScope = orgScope(session); // {} for SUPERADMIN, {organizationId} otherwise
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, totalRevenue, totalRegs, checkInRate] = await Promise.all([
    prisma.event.findMany({
      where: { ...eventScope, deletedAt: null },
      orderBy: { startAt: "desc" },
      take: 12,
      include: {
        _count: { select: { registrations: true } },
        ticketTypes: true,
        organization: { select: { name: true, slug: true } },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: "SUCCEEDED",
        createdAt: { gte: since },
        registration: { event: eventScope },
      },
      _sum: { amountCents: true },
    }),
    prisma.registration.count({
      where: {
        status: "CONFIRMED",
        createdAt: { gte: since },
        event: eventScope,
      },
    }),
    (async () => {
      const total = await prisma.ticket.count({
        where: { registration: { status: "CONFIRMED", event: eventScope } },
      });
      const checked = await prisma.checkIn.count({
        where: { event: eventScope },
      });
      return total === 0 ? 0 : Math.round((checked / total) * 100);
    })(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {isSuper ? "All organizations" : org?.name} · Last 30 days
            {!isSuper && org && (
              <>
                {" · "}
                <Link href={`/o/${org.slug}`} target="_blank" className="text-brand-700 hover:underline">
                  Public page ↗
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {/* KYC banner: only nag when there's actual MONEY waiting.
          Free events generate registrations but no revenue, so no payout is
          required — don't push organizers to set up Stripe Connect they
          don't need yet. */}
      {!isSuper && org && (
        <div className="mt-4">
          <KycBanner
            kycStatus={org.stripeAccountStatus}
            payoutsEnabled={org.stripeAccountPayoutsEnabled}
            hasSoldTicket={(totalRevenue._sum.amountCents ?? 0) > 0}
            pendingPayoutCents={totalRevenue._sum.amountCents ?? 0}
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue is org-financial data — not for door staff/volunteers. */}
        {session.role !== "STAFF" && session.role !== "VOLUNTEER" && (
          <Stat label="Revenue" value={money(totalRevenue._sum.amountCents ?? 0)} />
        )}
        <Stat label="Registrations" value={String(totalRegs)} />
        <Stat label="Check-in rate" value={`${checkInRate}%`} />
        <Stat label="Events" value={String(events.length)} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your events</h2>
        {session.role !== "STAFF" && session.role !== "VOLUNTEER" && (
          <div className="flex gap-2">
            <Link href="/dashboard/series/new" className="btn-secondary">+ Recurring series</Link>
            <Link href="/dashboard/events/new" className="btn-primary">+ Create event</Link>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Event</th>
              {isSuper && <th className="px-4 py-3">Organization</th>}
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Registrations</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.name}</td>
                {isSuper && (
                  <td className="px-4 py-3 text-slate-600">{(e as any).organization?.name ?? "—"}</td>
                )}
                <td className="px-4 py-3 text-slate-600">
                  {e.startAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{e.status}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.isPremium ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    {e.isPremium ? "Single Event" : "Free"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{e._count.registrations}</td>
                <td className="px-4 py-3 text-right">
                  {session.role === "STAFF" || session.role === "VOLUNTEER" ? (
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
              <tr><td colSpan={isSuper ? 7 : 6} className="px-4 py-8 text-center text-slate-500">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
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

