import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { money } from "@/lib/format";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveRefundRequestAction, denyRefundRequestAction } from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
  searchParams: { error?: string };
}

export default async function RefundRequestsPage({ params, searchParams }: Props) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const requests = await prisma.refundRequest.findMany({
    where: { eventId: event.id },
    include: {
      registration: {
        select: {
          firstName: true, lastName: true, email: true,
          totalCents: true, currency: true,
          ticketType: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const openCount = requests.filter((r) => r.status === "OPEN").length;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">
              &laquo; Event
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Refund Requests</span>
            {openCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {openCount} open
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />

        {requests.length === 0 ? (
          <div className="card py-12 text-center text-slate-500">
            No refund requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Attendee</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Ticket</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const reg = r.registration;
                  return (
                    <tr key={r.id} className={r.status === "OPEN" ? "bg-amber-50/30" : ""}>
                      <td className="px-3 py-2 font-medium">
                        {reg.firstName} {reg.lastName}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{reg.email}</td>
                      <td className="px-3 py-2">{reg.ticketType.name}</td>
                      <td className="px-3 py-2 text-right">{money(reg.totalCents, reg.currency)}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-slate-600" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "OPEN" ? "bg-amber-100 text-amber-700"
                          : r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                          : r.status === "DENIED" ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600"
                        }`}>{r.status}</span>
                        {r.reviewNote && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Note: {r.reviewNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {r.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.status === "OPEN" && (
                          <div className="flex items-center justify-end gap-2">
                            <form action={approveRefundRequestAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="requestId" value={r.id} />
                              <input type="hidden" name="note" value="" />
                              <ConfirmButton
                                label="Approve"
                                confirmText={`Approve refund request from ${reg.firstName} ${reg.lastName}? This will refund ${money(reg.totalCents, reg.currency)} minus the 4.5% processing fee via Stripe.`}
                                className="text-xs text-emerald-700 hover:underline"
                              />
                            </form>
                            <form action={denyRefundRequestAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="requestId" value={r.id} />
                              <input type="hidden" name="note" value="" />
                              <ConfirmButton
                                label="Deny"
                                confirmText={`Deny refund request from ${reg.firstName} ${reg.lastName}? They will be notified.`}
                                className="text-xs text-red-600 hover:underline"
                              />
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
