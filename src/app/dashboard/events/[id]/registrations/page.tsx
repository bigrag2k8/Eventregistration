import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { money } from "@/lib/format";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cancelRegistrationAction, deleteRegistrationAction, refundRegistrationAction, bulkRefundAction } from "../actions";
import { RegistrationsClient } from "./RegistrationsClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
  searchParams: { q?: string; status?: string; error?: string; refunded?: string; skipped?: string; failed?: string };
}

export default async function RegistrationsListPage({ params, searchParams }: Props) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const q = (searchParams.q ?? "").trim();
  const statusFilter = searchParams.status;

  const regs = await prisma.registration.findMany({
    where: {
      eventId: event.id,
      ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as any } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      ticketType: true,
      tickets: { include: { checkIn: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { refundedAmountCents: true, updatedAt: true, status: true, stripeRefundId: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const counts = await prisma.registration.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((a, b) => a + b._count, 0);

  const serializedRegs = regs.map((r) => {
    const checkedTickets = r.tickets.filter((t) => t.checkIn);
    const checkedCount = checkedTickets.length;
    const earliestCheckIn = checkedTickets
      .map((t) => t.checkIn!.scannedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const refundPayment = r.payments[0];
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      company: r.company,
      ticketName: r.ticketType.name,
      quantity: r.quantity,
      totalCents: r.totalCents,
      currency: r.currency,
      status: r.status,
      checkedCount,
      ticketCount: r.tickets.length || r.quantity,
      earliestCheckIn: earliestCheckIn
        ? `${earliestCheckIn.toLocaleDateString()} ${earliestCheckIn.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
        : null,
      createdAt: r.createdAt.toLocaleDateString(),
      refundedAmountCents: refundPayment?.refundedAmountCents ?? null,
      refundedAt: (r.status === "REFUNDED" || r.status === "PARTIALLY_REFUNDED") && refundPayment
        ? refundPayment.updatedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : null,
      qrTokens: r.tickets.map((t) => ({ id: t.id, token: t.qrToken, checkedIn: !!t.checkIn })),
      isRefundable: r.status === "CONFIRMED" && r.totalCents > 0,
    };
  });

  const bulkResult = searchParams.refunded !== undefined;
  const refundedCount = parseInt(searchParams.refunded ?? "0") || 0;
  const skippedCount = parseInt(searchParams.skipped ?? "0") || 0;
  const failedCount = parseInt(searchParams.failed ?? "0") || 0;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">◀ Event</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Registrations</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/api/events/${event.id}/export.csv`} className="btn-primary">Export CSV</a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {bulkResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${failedCount > 0 ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"}`}>
            Bulk refund complete: <strong>{refundedCount}</strong> refunded
            {skippedCount > 0 && <>, <strong>{skippedCount}</strong> skipped (no payment)</>}
            {failedCount > 0 && <>, <strong>{failedCount}</strong> failed</>}
          </div>
        )}

        {/* Filters */}
        <form className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Search</label>
            <input name="q" defaultValue={q} className="input" placeholder="Name, email, company..." />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={statusFilter ?? "ALL"} className="input">
              <option value="ALL">All ({total})</option>
              <option value="CONFIRMED">Confirmed ({countMap.CONFIRMED ?? 0})</option>
              <option value="PENDING">Pending ({countMap.PENDING ?? 0})</option>
              <option value="CANCELLED">Cancelled ({countMap.CANCELLED ?? 0})</option>
              <option value="REFUNDED">Refunded ({countMap.REFUNDED ?? 0})</option>
            </select>
          </div>
          <button type="submit" className="btn-secondary">Apply</button>
        </form>

        {/* Table with bulk select */}
        <RegistrationsClient
          eventId={event.id}
          isSuperAdmin={session.role === "SUPERADMIN"}
          regs={serializedRegs}
          cancelAction={cancelRegistrationAction}
          deleteAction={deleteRegistrationAction}
          refundAction={refundRegistrationAction}
          bulkRefundAction={bulkRefundAction}
        />

        <p className="text-xs text-slate-400">Showing up to 500 most recent. Use Export CSV for the full list.</p>
      </div>
    </main>
  );
}
