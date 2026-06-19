import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getSession, orgScope } from "@/lib/auth";
import { QrActions } from "./QrActions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Event QR code — Your Events App" };

/**
 * Standalone QR window for an event. Opened in a small popup from the event
 * config page. Renders a QR code that points at the event's public registration
 * page (generated on demand from the current public URL, so it never goes
 * stale), plus copy + close controls. Lives outside /dashboard so the popup has
 * no dashboard chrome. Org-scoped: organizers only see their own events.
 */
export default async function EventQrPage({ params }: { params: { id: string } }) {
  // This page lives outside the dashboard layout, so it must gate auth itself.
  // Redirect (not throw) on a missing/insufficient session so an expired popup
  // lands on sign-in instead of a 500.
  const session = await getSession();
  if (!session || !["ORGANIZER", "ADMIN", "SUPERADMIN"].includes(session.role)) {
    redirect("/signin");
  }

  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
    include: { organization: { select: { slug: true } } },
  });
  if (!event) return notFound();

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app";
  const link = `${base}/o/${event.organization.slug}/events/${event.slug}`;
  const qrDataUrl = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 320 });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">{event.name}</h1>
        <p className="mt-1 text-xs text-slate-500">Scan to open the event registration page</p>

        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code for ${event.name}`}
            width={256}
            height={256}
            className="rounded-lg ring-1 ring-slate-200"
          />
        </div>

        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block break-all text-xs text-brand-700 hover:underline"
        >
          {link}
        </a>

        <QrActions dataUrl={qrDataUrl} link={link} fileName={`${event.slug}-qr.png`} />
      </div>
    </main>
  );
}
