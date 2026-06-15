import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountRefundRequestsPage() {
  const session = await getSession();
  if (!session) return null;

  const requests = await prisma.refundRequest.findMany({
    where: { registration: { userId: session.sub } },
    include: {
      registration: {
        select: {
          totalCents: true, currency: true,
          event: { select: { name: true, slug: true, organization: { select: { slug: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-bold">Refund requests</h1>
      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">You haven't requested any refunds.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((r) => {
            const ev = r.registration.event;
            return (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/o/${ev.organization.slug}/events/${ev.slug}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {ev.name}
                    </Link>
                    <div className="mt-1 text-sm text-slate-500">
                      Paid {money(r.registration.totalCents, r.registration.currency)} &middot; requested{" "}
                      {r.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === "OPEN" ? "bg-amber-100 text-amber-700"
                    : r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                    : r.status === "DENIED" ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-600"
                  }`}>{r.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="text-slate-400">Your reason:</span> {r.reason}
                </p>
                {r.reviewNote && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-400">Organizer note:</span> {r.reviewNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
