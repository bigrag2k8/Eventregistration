import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function CheckinEventPicker() {
  const session = requireRole(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"], await getSession());

  const events = await prisma.event.findMany({
    where: {
      organizationId: session.orgId,
      deletedAt: null,
      status: "PUBLISHED",
      endAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // upcoming + recently ended
    },
    orderBy: { startAt: "asc" },
    include: {
      location: true,
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-sm opacity-70" title="Automated I.T. Solutions Events APP">AITS Events</Link>
        <span className="text-xs opacity-70">{session.email}</span>
        <SignOutButton className="text-sm opacity-70 hover:text-red-400" />
      </header>

      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="text-2xl font-bold">Pick an event to scan</h1>
        <p className="mt-1 text-sm opacity-70">Tap an event to open the QR scanner.</p>

        <div className="mt-6 space-y-3">
          {events.length === 0 && (
            <div className="rounded-xl bg-white/5 p-6 text-center opacity-70">
              No active events right now.
            </div>
          )}
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/checkin/${e.id}`}
              className="block rounded-xl bg-white/10 p-4 transition hover:bg-white/20"
            >
              <div className="text-lg font-semibold">{e.name}</div>
              <div className="text-sm opacity-80">
                {e.startAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {e.startAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              {e.location?.venueName && (
                <div className="text-sm opacity-60">{e.location.venueName}</div>
              )}
              <div className="mt-2 text-xs opacity-60">{e._count.registrations} registered</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
