import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { formatDateRange, money } from "@/lib/format";
import { publishAction, unpublishAction, deleteAction, addTicketTypeAction, deleteTicketTypeAction, updateBasicsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EventManagePage({ params }: { params: { id: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());

  const event = await prisma.event.findFirst({
    where: { id: params.id, organizationId: session.orgId, deletedAt: null },
    include: {
      location: true,
      ticketTypes: { orderBy: { sortOrder: "asc" } },
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });
  if (!event) return notFound();

  const totalRevenue = await prisma.payment.aggregate({
    where: { status: "SUCCEEDED", registration: { eventId: event.id } },
    _sum: { amountCents: true },
  });

  const publicUrl = `/events/${event.slug}`;
  const isPublished = event.status === "PUBLISHED";

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-brand-700">◀ Dashboard</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              isPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}>{event.status}</span>
          </div>
          <div className="flex gap-2">
            <Link href={publicUrl} target="_blank" className="btn-secondary">View public page ↗</Link>
            <Link href={`/checkin/${event.id}`} className="btn-secondary">Check-in</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Registered" value={String(event._count.registrations)} />
          <Stat label="Revenue" value={money(totalRevenue._sum.amountCents ?? 0)} />
          <Stat label="Capacity" value={event.capacity ? `${event._count.registrations} / ${event.capacity}` : "Unlimited"} />
        </div>

        {/* Publish / unpublish + actions */}
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isPublished ? "This event is live" : "This event is a draft"}</h2>
            <p className="text-sm text-slate-500">
              {isPublished ? "Anyone with the link can register." : "Not visible to attendees yet."}
            </p>
          </div>
          <div className="flex gap-2">
            {isPublished ? (
              <form action={unpublishAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className="btn-secondary">Unpublish</button>
              </form>
            ) : (
              <form action={publishAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className="btn-primary">Publish event</button>
              </form>
            )}
            <Link href={`/dashboard/events/${event.id}/registrations`} className="btn-secondary">View registrations</Link>
            <a href={`/api/events/${event.id}/export.csv`} className="btn-secondary">Export CSV</a>
          </div>
        </section>

        {/* Basics editor */}
        <section className="card">
          <h2 className="text-lg font-semibold">Basics</h2>
          <form action={updateBasicsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="eventId" value={event.id} />
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input name="name" required defaultValue={event.name} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Short description</label>
              <input name="shortDescription" defaultValue={event.shortDescription ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea name="description" required rows={4} defaultValue={event.description} className="input" />
            </div>
            <div>
              <label className="label">Start</label>
              <input name="startAt" type="datetime-local" required defaultValue={event.startAt.toISOString().slice(0, 16)} className="input" />
            </div>
            <div>
              <label className="label">End</label>
              <input name="endAt" type="datetime-local" required defaultValue={event.endAt.toISOString().slice(0, 16)} className="input" />
            </div>
            <div>
              <label className="label">Capacity</label>
              <input name="capacity" type="number" min="1" defaultValue={event.capacity ?? ""} className="input" placeholder="Unlimited" />
            </div>
            <div>
              <label className="label">Contact email</label>
              <input name="contactEmail" type="email" defaultValue={event.contactEmail ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Refund policy</label>
              <textarea name="refundPolicy" rows={2} defaultValue={event.refundPolicy ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Save changes</button>
            </div>
          </form>
        </section>

        {/* Ticket types */}
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ticket types</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Sold / Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {event.ticketTypes.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 text-slate-500">{t.kind}</td>
                    <td className="px-3 py-2 text-right">{t.priceCents === 0 ? "Free" : money(t.priceCents)}</td>
                    <td className="px-3 py-2 text-right">
                      {t.quantitySold} / {t.quantityTotal ?? "∞"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteTicketTypeAction} className="inline">
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="ticketTypeId" value={t.id} />
                        <button type="submit"
                          className="text-xs text-red-600 hover:underline"
                          disabled={t.quantitySold > 0}
                          title={t.quantitySold > 0 ? "Has registrations" : "Delete"}>
                          {t.quantitySold > 0 ? "—" : "Delete"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={addTicketTypeAction} className="mt-6 grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="eventId" value={event.id} />
            <div className="sm:col-span-2">
              <label className="label">New ticket name</label>
              <input name="name" required className="input" placeholder="VIP" />
            </div>
            <div>
              <label className="label">Price ($)</label>
              <input name="price" type="number" step="0.01" min="0" defaultValue="0" className="input" />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input name="quantity" type="number" min="1" className="input" placeholder="∞" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full">Add ticket type</button>
            </div>
          </form>
        </section>

        {/* Danger zone */}
        <section className="card border-red-200 ring-red-100">
          <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
          <form action={deleteAction} className="mt-3 flex items-center justify-between">
            <p className="text-sm text-slate-600">Soft-delete this event. Existing registrations remain.</p>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="btn-secondary text-red-700 hover:bg-red-50">Delete event</button>
          </form>
        </section>
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
