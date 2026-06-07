import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderQrPngDataUrl } from "@/server/tickets";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  params, searchParams,
}: { params: { slug: string }; searchParams: { reg?: string } }) {
  if (!searchParams.reg) return notFound();
  const reg = await prisma.registration.findUnique({
    where: { id: searchParams.reg },
    include: { event: true, ticketType: true, tickets: true },
  });
  if (!reg) return notFound();

  const qrs = await Promise.all(reg.tickets.map((t) => renderQrPngDataUrl(t.qrToken)));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="card text-center">
        <div className="text-3xl">🎉</div>
        <h1 className="mt-2 text-2xl font-bold">You're registered!</h1>
        <p className="mt-1 text-slate-600">
          Confirmation sent to <strong>{reg.email}</strong>
        </p>

        <div className="mt-6 text-left">
          <div className="font-medium">{reg.event.name}</div>
          <div className="text-sm text-slate-600">{reg.ticketType.name} × {reg.quantity}</div>
          <div className="text-sm text-slate-600">Total: {money(reg.totalCents, reg.currency)}</div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {reg.tickets.map((t, i) => (
            <div key={t.id} className="rounded-xl ring-1 ring-slate-200 p-4">
              <div className="text-xs font-medium text-slate-500">Ticket #{i + 1}</div>
              <div className="mt-2 font-medium">{t.attendeeName}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrs[i]} alt="QR" className="mx-auto mt-3 h-44 w-44" />
              <a href={qrs[i]} download={`ticket-${i + 1}.png`} className="btn-secondary mt-3 inline-block">Download</a>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a className="btn-secondary" href={`/api/registrations/${reg.id}/ics`}>Add to Calendar</a>
          <Link className="btn-secondary" href={`/events/${reg.event.slug}`}>Event page</Link>
        </div>
      </div>
    </main>
  );
}
