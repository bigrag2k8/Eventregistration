import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateRange, money } from "@/lib/format";

export const dynamic = "force-dynamic";

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700"
    : status === "PENDING" ? "bg-amber-100 text-amber-700"
    : status === "REFUNDED" || status === "PARTIALLY_REFUNDED" ? "bg-purple-100 text-purple-700"
    : "bg-slate-100 text-slate-600";
  const label = status === "PARTIALLY_REFUNDED" ? "PART. REFUNDED" : status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export default async function MyEventsPage() {
  const session = await getSession();
  // Layout guarantees a session, but keep the type narrow.
  if (!session) return null;

  const regs = await prisma.registration.findMany({
    where: { userId: session.sub, deletedAt: null },
    include: {
      event: { include: { organization: { select: { slug: true } } } },
      ticketType: { select: { name: true } },
      refundRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
    orderBy: { event: { startAt: "desc" } },
  });

  const now = new Date();
  const upcoming = regs.filter((r) => r.event.startAt >= now);
  const past = regs.filter((r) => r.event.startAt < now);

  function Card({ r }: { r: (typeof regs)[number] }) {
    const orgSlug = r.event.organization.slug;
    const base = `/o/${orgSlug}/events/${r.event.slug}`;
    const keyQ = r.accessToken ? `&key=${r.accessToken}` : "";
    const openRefund = r.refundRequests[0]?.status === "OPEN";
    const canRefund = r.status === "CONFIRMED" && r.totalCents > 0 && !openRefund;
    return (
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href={base} className="font-semibold text-brand-700 hover:underline">
              {r.event.name}
            </Link>
            <div className="mt-1 text-sm text-slate-600">
              {formatDateRange(r.event.startAt, r.event.endAt, r.event.timezone)}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {r.ticketType.name} &times; {r.quantity} &middot; {money(r.totalCents, r.currency)}
            </div>
          </div>
          <StatusPill status={r.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {r.status === "CONFIRMED" && r.accessToken && (
            <>
              <Link href={`${base}/success?reg=${r.id}${keyQ}`} className="text-brand-700 hover:underline">
                View tickets
              </Link>
              <a href={`/api/registrations/${r.id}/ics?key=${r.accessToken}`} className="text-brand-700 hover:underline">
                Add to calendar
              </a>
            </>
          )}
          {canRefund && (
            <Link href={`${base}/refund-request?reg=${r.id}${keyQ}`} className="text-slate-500 hover:underline">
              Request refund
            </Link>
          )}
          {r.refundRequests[0] && (
            <span className="text-slate-500">
              Refund request: <strong>{r.refundRequests[0].status}</strong>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold">Upcoming events</h1>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            You're not registered for any upcoming events yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcoming.map((r) => <Card key={r.id} r={r} />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-700">Past events</h2>
          <div className="mt-4 space-y-3">
            {past.map((r) => <Card key={r.id} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
