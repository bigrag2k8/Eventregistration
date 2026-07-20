import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, orgScope } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import { KycBanner } from "@/components/KycBanner";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { RecurringEventGroup } from "@/components/RecurringEventGroup";
import { money } from "@/lib/format";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { describeRecurrence } from "@/server/recurring-rule";
import { deleteRecurringEventAction } from "./recurring/actions";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"];

export default async function DashboardHome({ searchParams }: { searchParams?: { error?: string } }) {
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
  const [events, recurringEvents, totalRevenue, totalRegs, checkInRate, publishedCount, totalEventCount] = await Promise.all([
    prisma.event.findMany({
      // Recurring-event occurrences are listed UNDER their recurring event (RecurringEventGroup), so keep
      // them out of the one-off events table — otherwise every session shows up
      // here as its own row and drowns the real events.
      where: { ...eventScope, deletedAt: null, recurringEventId: null },
      orderBy: { startAt: "desc" },
      take: 12,
      include: {
        _count: { select: { registrations: true } },
        ticketTypes: true,
        organization: { select: { name: true, slug: true } },
      },
    }),
    prisma.recurringEvent.findMany({
      where: { ...eventScope, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { slug: true } },
        events: {
          where: { deletedAt: null },
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            timezone: true,
            _count: { select: { registrations: true } },
          },
        },
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
    prisma.event.count({ where: { ...eventScope, deletedAt: null, status: "PUBLISHED" } }),
    // Every event incl. series sessions — the "Events" stat should not drop
    // just because sessions moved under their series (and this also fixes the
    // old count, which was capped by the table's take:12).
    prisma.event.count({ where: { ...eventScope, deletedAt: null } }),
  ]);

  // Onboarding checklist: shown to a real (non-super) organizer/admin until
  // they publish their first event. Established orgs (already published) and
  // door staff never see it.
  const showOnboarding =
    !isSuper &&
    !!org &&
    (session.role === "ORGANIZER" || session.role === "ADMIN") &&
    publishedCount === 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {searchParams?.error && (
        <div className="mb-4">
          <ErrorBanner code={searchParams.error} />
        </div>
      )}
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

      {showOnboarding && org && (
        <OnboardingChecklist
          brandDone={!!org.logoUrl}
          payoutsDone={!!org.stripeAccountChargesEnabled}
          hasEvent={events.length > 0}
          publishedDone={publishedCount > 0}
        />
      )}

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
        <Stat label="Events" value={String(totalEventCount)} />
      </div>

      {/* This section always renders — it owns the "create a recurring event"
          button, so gating it on recurringEvents.length would leave an org with no
          recurring events unable to make their first one. */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your recurring events</h2>
        {session.role !== "STAFF" && session.role !== "VOLUNTEER" && (
          <Link href="/dashboard/recurring/new" className="btn-primary">+ Recurring events</Link>
        )}
      </div>

      {recurringEvents.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No recurring events yet — create one for a class, weekly meetup, or anything that repeats.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Series</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Regs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              {recurringEvents.map((s) => {
                const canManage = session.role !== "STAFF" && session.role !== "VOLUNTEER";
                return (
                  <RecurringEventGroup
                    key={s.id}
                    recurringEventId={s.id}
                    name={s.name}
                    schedule={describeRecurrence(s)}
                    status={s.status}
                    totalRegs={s.events.reduce((n, e) => n + e._count.registrations, 0)}
                    canManage={canManage}
                    sessions={s.events.map((e, i) => ({
                      id: e.id,
                      dateLabel: formatInTimeZone(e.startAt, e.timezone, "EEE, MMM d · h:mm a"),
                      sessionLabel: `Session ${i + 1} of ${s.events.length}`,
                      status: e.status,
                      regs: e._count.registrations,
                      isPast: e.endAt < new Date(),
                    }))}
                    actions={
                      <div className="flex items-center justify-end gap-3">
                        {canManage && (
                          <Link href={`/dashboard/recurring/${s.id}/edit`} className="text-xs text-brand-700 hover:underline">
                            Edit
                          </Link>
                        )}
                        <Link href={`/o/${s.organization.slug}/recurring/${s.slug}`} target="_blank" className="text-xs text-brand-700 hover:underline">
                          View ↗
                        </Link>
                        {canManage && (
                          <form action={deleteRecurringEventAction}>
                            <input type="hidden" name="recurringEventId" value={s.id} />
                            <ConfirmButton
                              label="Delete"
                              confirmText={`Delete "${s.name}"? Upcoming sessions with no registrations are removed and no new sessions will be generated. Sessions that already have ticket holders block this — cancel those sessions first.`}
                            />
                          </form>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </table>
          </div>
        </>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your events</h2>
        {session.role !== "STAFF" && session.role !== "VOLUNTEER" && (
          <Link href="/dashboard/events/new" className="btn-primary">+ Create event</Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-4xl" aria-hidden>🎟️</div>
          <h3 className="mt-3 text-lg font-semibold">No events yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {session.role === "STAFF" || session.role === "VOLUNTEER"
              ? "You'll see events here once an organizer creates them."
              : "Create your first event in a few guided steps — you can save a draft and finish anytime."}
          </p>
          {session.role !== "STAFF" && session.role !== "VOLUNTEER" && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/events/new" className="btn-primary">+ Create your first event</Link>
            </div>
          )}
        </div>
      ) : (
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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    e.isConference ? "bg-indigo-100 text-indigo-700" : e.isPremium ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {e.isConference ? "Conference" : e.isPremium ? "Single Event" : "Free"}
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
          </tbody>
        </table>
      </div>
      )}
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

