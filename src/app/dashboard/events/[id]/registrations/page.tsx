import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { money } from "@/lib/format";
import { SignOutButton } from "@/components/SignOutButton";
import { CopyButton } from "@/components/CopyButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cancelRegistrationAction, deleteRegistrationAction, refundRegistrationAction } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
  searchParams: { q?: string; status?: string; error?: string };
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
    include: { ticketType: true, tickets: { include: { checkIn: true } } },
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
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {/* Filters */}
        <form className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Search</label>
            <input name="q" defaultValue={q} className="input" placeholder="Name, email, company…" />
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

        {/* Table */}
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Checked in</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {regs.map((r) => {
                const checkedTickets = r.tickets.filter((t) => t.checkIn);
                const checkedCount = checkedTickets.length;
                const earliestCheckIn = checkedTickets
                  .map((t) => t.checkIn!.scannedAt)
                  .sort((a, b) => a.getTime() - b.getTime())[0];
                return (
                  <Fragment key={r.id}>
                  <tr>
                    <td className="px-3 py-2 font-medium">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email}</td>
                    <td className="px-3 py-2 text-slate-600">{r.company ?? ""}</td>
                    <td className="px-3 py-2">{r.ticketType.name}</td>
                    <td className="px-3 py-2 text-right">{r.quantity}</td>
                    <td className="px-3 py-2 text-right">{money(r.totalCents, r.currency)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700"
                        : r.status === "PENDING" ? "bg-amber-100 text-amber-700"
                        : r.status === "REFUNDED" ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-600"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div>{checkedCount}/{r.tickets.length || r.quantity}</div>
                      {earliestCheckIn && (
                        <div className="text-xs text-slate-500">
                          {earliestCheckIn.toLocaleDateString()}{" "}
                          {earliestCheckIn.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.createdAt.toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === "CONFIRMED" && r.totalCents > 0 && (
                          <form action={refundRegistrationAction} className="inline">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="registrationId" value={r.id} />
                            <ConfirmButton
                              label="Refund"
                              confirmText={`Refund $${(r.totalCents / 100).toFixed(2)} to ${r.firstName} ${r.lastName}? Stripe will reverse the transfer from your account and also refund the platform fee.`}
                              className="text-xs text-brand-700 hover:underline"
                            />
                          </form>
                        )}
                        {r.status !== "CANCELLED" && (
                          <form action={cancelRegistrationAction} className="inline">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="registrationId" value={r.id} />
                            <ConfirmButton
                              label="Cancel"
                              confirmText={`Cancel registration for ${r.firstName} ${r.lastName}? Tickets will be invalidated and the seat opens back up.`}
                              className="text-xs text-amber-600 hover:underline"
                            />
                          </form>
                        )}
                        <form action={deleteRegistrationAction} className="inline">
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="registrationId" value={r.id} />
                          <ConfirmButton
                            label="Delete"
                            confirmText={`PERMANENTLY delete registration for ${r.firstName} ${r.lastName}? This cannot be undone.`}
                            className="text-xs text-red-600 hover:underline"
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                  {r.tickets.length > 0 && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={10} className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-slate-500">
                            Show {r.tickets.length} QR token{r.tickets.length > 1 ? "s" : ""} (for manual check-in entry)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {r.tickets.map((t, i) => (
                              <div key={t.id} className="flex items-start gap-2">
                                <span className="text-xs text-slate-500 whitespace-nowrap pt-2">#{i + 1}{t.checkIn ? " ✓" : ""}</span>
                                <textarea
                                  readOnly
                                  rows={2}
                                  className="grow rounded border border-slate-200 bg-white p-2 font-mono text-[10px] break-all"
                                  defaultValue={t.qrToken}
                                />
                                <CopyButton text={t.qrToken} />
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {regs.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-slate-500">No registrations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400">Showing up to 500 most recent. Use Export CSV for the full list.</p>
      </div>
    </main>
  );
}
