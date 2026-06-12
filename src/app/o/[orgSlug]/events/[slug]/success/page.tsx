import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderQrPngDataUrl } from "@/server/tickets";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  params, searchParams,
}: { params: { orgSlug: string; slug: string }; searchParams: { reg?: string; key?: string } }) {
  if (!searchParams.reg) return notFound();
  const reg = await prisma.registration.findUnique({
    where: { id: searchParams.reg },
    include: { event: { include: { organization: true } }, ticketType: true, tickets: true },
  });
  if (!reg) return notFound();
  if (reg.event.organization.slug !== params.orgSlug) return notFound();

  // QR tokens ARE the tickets — only render them for someone holding the
  // access key (delivered via the registration response / Stripe redirect),
  // not anyone who learns the registration id (leaks via logs, referrers).
  // Older registrations (no accessToken) fall back to email-only delivery.
  const canViewTickets = !!reg.accessToken && searchParams.key === reg.accessToken;
  const qrs = canViewTickets
    ? await Promise.all(reg.tickets.map((t) => renderQrPngDataUrl(t.qrToken)))
    : [];
  const icsHref = `/api/registrations/${reg.id}/ics${canViewTickets ? `?key=${reg.accessToken}` : ""}`;

  // Don't claim success for a registration that isn't actually confirmed —
  // a PENDING reg (payment still settling / webhook delayed) or a cancelled/
  // refunded one would otherwise show "You're registered!" with no tickets.
  if (reg.status !== "CONFIRMED") {
    const pending = reg.status === "PENDING";
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="card text-center">
          <div className="text-3xl">{pending ? "⏳" : "ℹ️"}</div>
          <h1 className="mt-2 text-2xl font-bold">
            {pending ? "Finishing your registration…" : "Registration not active"}
          </h1>
          <p className="mt-2 text-slate-600">
            {pending
              ? "Your payment is being confirmed. This page will show your tickets once it completes — we'll also email them to "
              : "This registration is "}
            {pending ? <strong>{reg.email}</strong> : <strong>{reg.status.toLowerCase()}</strong>}
            {pending ? ". You can refresh in a moment." : ". If you think this is a mistake, contact the organizer."}
          </p>
          <div className="mt-6 text-left text-sm text-slate-600">
            <div className="font-medium text-slate-900">{reg.event.name}</div>
            <div>{reg.ticketType.name} × {reg.quantity}</div>
          </div>
          <div className="mt-6">
            <Link className="btn-secondary" href={`/o/${params.orgSlug}/events/${reg.event.slug}`}>Event page</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="card text-center">
        <div className="text-3xl">🎉</div>
        <h1 className="mt-2 text-2xl font-bold">You're registered!</h1>
        <p className="mt-1 text-slate-600">Confirmation sent to <strong>{reg.email}</strong></p>

        <div className="mt-6 text-left">
          <div className="font-medium">{reg.event.name}</div>
          <div className="text-sm text-slate-600">{reg.ticketType.name} × {reg.quantity}</div>
          <div className="text-sm text-slate-600">Total: {money(reg.totalCents, reg.currency)}</div>
        </div>

        {canViewTickets ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {reg.tickets.map((t, i) => (
              <div key={t.id} className="rounded-xl ring-1 ring-slate-200 p-4">
                <div className="text-xs font-medium text-slate-500">Ticket #{i + 1}</div>
                <div className="mt-2 font-medium">{t.attendeeName}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrs[i]} alt="QR" className="mx-auto mt-3 h-44 w-44" />
                <a href={qrs[i]} download={`ticket-${i + 1}.png`} className="btn-secondary mt-3 inline-block">Download</a>
                <details className="mt-3 text-left">
                  <summary className="cursor-pointer text-xs text-slate-500">Show QR token (for manual entry)</summary>
                  <textarea readOnly className="mt-2 w-full break-all rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px]" rows={4} defaultValue={t.qrToken} />
                </details>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            Your QR tickets were sent to <strong>{reg.email}</strong>. For security,
            tickets can't be displayed from this link — check your inbox.
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {canViewTickets && <a className="btn-secondary" href={icsHref}>Add to Calendar</a>}
          <Link className="btn-secondary" href={`/o/${params.orgSlug}/events/${reg.event.slug}`}>Event page</Link>
        </div>
      </div>
    </main>
  );
}
