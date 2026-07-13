import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";
import { OrgBrandStyle } from "@/components/OrgBrandStyle";
import { describeRecurrence } from "@/server/series-rule";
import { CalendarClock, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SeriesPublicPage({ params }: { params: { orgSlug: string; slug: string } }) {
  const org = await prisma.organization.findFirst({
    where: { slug: params.orgSlug, deletedAt: null },
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true },
  });
  if (!org) return notFound();

  const series = await prisma.eventSeries.findFirst({
    where: { organizationId: org.id, slug: params.slug, deletedAt: null, status: { in: ["ACTIVE", "ENDED"] } },
  });
  if (!series) return notFound();

  const now = new Date();
  const upcoming = await prisma.event.findMany({
    where: { seriesId: series.id, deletedAt: null, status: "PUBLISHED", endAt: { gte: now } },
    orderBy: { startAt: "asc" },
    take: 30,
    include: { ticketTypes: { select: { priceCents: true } } },
  });

  const brand = series.bannerUrl ? undefined : "linear-gradient(135deg, var(--org-brand), #0f172a)";
  const minPriceOf = (e: (typeof upcoming)[number]) =>
    e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t) => t.priceCents)) : 0;

  return (
    <main>
      <OrgBrandStyle color={org.brandColor} />

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href={`/o/${org.slug}`} className="flex items-center gap-2">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt={org.name} className="h-8 max-w-[160px] object-contain" />
            )}
            <span className="font-bold" style={{ color: "var(--org-brand)" }}>{org.name}</span>
          </Link>
          <Link href="/signin" className="text-sm">Sign in</Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative bg-slate-900">
        {series.bannerUrl ? (
          <div className="aspect-[16/5] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={series.bannerUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="aspect-[16/6] w-full sm:aspect-[16/4]" style={{ background: brand }} />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-4xl px-4 pb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs text-white ring-1 ring-white/25">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Recurring series
            </span>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight text-white drop-shadow-md sm:text-4xl">
              {series.name}
            </h1>
            <p className="mt-1 text-white/90 drop-shadow">{describeRecurrence(series)}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {series.description && series.description !== series.name && (
          <p className="max-w-3xl whitespace-pre-line leading-relaxed text-slate-700">{series.description}</p>
        )}

        <div className="mt-8 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Upcoming sessions</h2>
          <div className="h-px flex-1" style={{ background: "linear-gradient(to right, var(--org-brand), transparent)" }} />
        </div>

        {upcoming.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <CalendarClock className="mx-auto h-9 w-9 text-slate-400" aria-hidden />
            <p className="mt-3 font-medium text-slate-700">No upcoming sessions scheduled</p>
            <p className="mt-1 text-sm text-slate-500">Check back soon — new sessions are added automatically.</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200">
            {upcoming.map((e) => {
              const min = minPriceOf(e);
              return (
                <li key={e.id}>
                  <Link
                    href={`/o/${org.slug}/events/${e.slug}`}
                    className="flex items-center justify-between gap-4 bg-white px-4 py-4 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{formatDateRange(e.startAt, e.endAt, e.timezone)}</div>
                      <div className="mt-0.5 text-sm text-slate-500">{min === 0 ? "Free" : `From $${(min / 100).toFixed(2)}`}</div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium" style={{ color: "var(--org-brand)" }}>
                      Register <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
