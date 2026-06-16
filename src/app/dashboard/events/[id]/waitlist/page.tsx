import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WaitlistPage({ params }: { params: { id: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const entries = await prisma.waitlist.findMany({
    where: { eventId: event.id },
    orderBy: { position: "asc" },
    take: 500,
  });

  const statusCounts = {
    WAITING: entries.filter((e) => e.status === "WAITING").length,
    PROMOTED: entries.filter((e) => e.status === "PROMOTED").length,
    CONVERTED: entries.filter((e) => e.status === "CONVERTED").length,
    EXPIRED: entries.filter((e) => e.status === "EXPIRED").length,
    LEFT: entries.filter((e) => e.status === "LEFT").length,
  };

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">&laquo; Event</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Waitlist</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap gap-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200">
              <div className="text-xs text-slate-500">{status}</div>
              <div className="text-lg font-bold">{count}</div>
            </div>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="card py-12 text-center text-slate-500">
            No one on the waitlist yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2">Promoted</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-medium">{e.position}</td>
                    <td className="px-3 py-2">{e.firstName} {e.lastName}</td>
                    <td className="px-3 py-2 text-slate-600">{e.email}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.status === "WAITING" ? "bg-amber-100 text-amber-700"
                        : e.status === "PROMOTED" ? "bg-blue-100 text-blue-700"
                        : e.status === "CONVERTED" ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                      }`}>{e.status}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{e.createdAt.toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-slate-500">{e.promotedAt?.toLocaleDateString() ?? ""}</td>
                    <td className="px-3 py-2 text-slate-500">{e.expiresAt?.toLocaleDateString() ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400">
          The worker automatically promotes waitlist entries when capacity opens up and sends a registration link by email.
          Promoted entries expire after 24 hours if not used.
        </p>
      </div>
    </main>
  );
}
