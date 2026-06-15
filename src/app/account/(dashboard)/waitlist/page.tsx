import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountWaitlistPage() {
  const session = await getSession();
  if (!session) return null;

  const entries = await prisma.waitlist.findMany({
    where: { userId: session.sub },
    include: { event: { include: { organization: { select: { slug: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-bold">Your waitlists</h1>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">You're not on any waitlists.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((w) => {
            const base = `/o/${w.event.organization.slug}/events/${w.event.slug}`;
            const expired = w.status === "PROMOTED" && w.expiresAt && w.expiresAt < new Date();
            const effectiveStatus = expired ? "EXPIRED" : w.status;
            return (
              <div key={w.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={base} className="font-semibold text-brand-700 hover:underline">
                      {w.event.name}
                    </Link>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatDateRange(w.event.startAt, w.event.endAt, w.event.timezone)}
                    </div>
                    {effectiveStatus === "WAITING" && (
                      <div className="mt-1 text-sm text-slate-500">Position #{w.position}</div>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    effectiveStatus === "WAITING" ? "bg-amber-100 text-amber-700"
                    : effectiveStatus === "PROMOTED" ? "bg-blue-100 text-blue-700"
                    : effectiveStatus === "CONVERTED" ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                  }`}>{effectiveStatus}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {effectiveStatus === "PROMOTED" && w.magicToken && (
                    <Link href={`${base}/register?waitlist=${w.magicToken}`} className="font-medium text-brand-700 hover:underline">
                      Claim your spot
                    </Link>
                  )}
                  {(effectiveStatus === "WAITING" || effectiveStatus === "PROMOTED") && w.leaveToken && (
                    <Link href={`/waitlist/leave/${w.leaveToken}`} className="text-slate-500 hover:underline">
                      Leave waitlist
                    </Link>
                  )}
                  {effectiveStatus === "PROMOTED" && w.expiresAt && !expired && (
                    <span className="text-slate-500">
                      Claim before {w.expiresAt.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
