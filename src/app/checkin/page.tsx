import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function CheckinEventPicker() {
  const session = requireRole(["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"], await getSession());

  const isStaffOrVolunteer = session.role === "STAFF" || session.role === "VOLUNTEER";

  // For STAFF/VOLUNTEER, check if they have any explicit event assignments.
  // If yes, only show those events. If no assignments, treat them as org-wide (see all).
  let scopedEventIds: string[] | null = null;
  if (isStaffOrVolunteer) {
    const assignments = await prisma.eventAssignment.findMany({
      where: { userId: session.sub },
      select: { eventId: true },
    });
    if (assignments.length > 0) {
      scopedEventIds = assignments.map((a) => a.eventId);
    }
  }

  const events = await prisma.event.findMany({
    where: {
      ...orgScope(session),
      deletedAt: null,
      status: "PUBLISHED",
      endAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // upcoming + recently ended
      ...(scopedEventIds ? { id: { in: scopedEventIds } } : {}),
    },
    orderBy: { startAt: "asc" },
    include: {
      location: true,
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
      assignments: isStaffOrVolunteer ? { where: { userId: session.sub } } : false,
    },
  });

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-sm opacity-70" title="Your Events App"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
        <span className="text-xs opacity-70">{session.email}</span>
        <SignOutButton className="text-sm opacity-70 hover:text-red-400" />
      </header>

      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="text-2xl font-bold">Pick an event to scan</h1>
        <p className="mt-1 text-sm opacity-70">
          {scopedEventIds
            ? "You're assigned to these specific events. Tap one to open the QR scanner."
            : "Tap an event to open the QR scanner."}
        </p>

        <div className="mt-6 space-y-3">
          {events.length === 0 && (
            <div className="rounded-xl bg-white/5 p-6 text-center opacity-70">
              {scopedEventIds
                ? "You're not assigned to any active events. Check with your organizer."
                : "No active events right now."}
            </div>
          )}
          {events.map((e) => {
            const myAssignment = (e as any).assignments?.[0];
            return (
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
                {myAssignment?.roleDescription && (
                  <div className="mt-2 rounded bg-amber-500/20 p-2 text-xs">
                    <strong>Your duties:</strong> {myAssignment.roleDescription}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
