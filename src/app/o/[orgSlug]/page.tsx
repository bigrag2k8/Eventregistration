import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";
import { OrgBrandStyle } from "@/components/OrgBrandStyle";

export const dynamic = "force-dynamic";

export default async function OrgPublicPage({ params }: { params: { orgSlug: string } }) {
  const org = await prisma.organization.findFirst({
    where: { slug: params.orgSlug, deletedAt: null },
    include: {
      events: {
        where: { status: "PUBLISHED", deletedAt: null, isPrivate: false, startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        include: { location: true, ticketTypes: true },
        take: 50,
      },
    },
  });
  if (!org) return notFound();

  return (
    <main>
      <OrgBrandStyle color={org.brandColor} />

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href={`/o/${org.slug}`} className="flex items-center gap-2">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt={org.name} className="h-8 max-w-[160px] object-contain" />
            )}
            <span className="font-bold" style={{ color: "var(--org-brand)" }}>{org.name}</span>
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/signin">Sign in</Link>
          </nav>
        </div>
      </header>

      {org.bannerUrl && (
        <div className="aspect-[16/5] w-full overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={org.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--org-brand)" }}>{org.name}</h1>
        {org.tagline && <p className="mt-2 text-lg text-slate-600">{org.tagline}</p>}
        {org.aboutBlurb && (
          <p className="mt-4 max-w-3xl whitespace-pre-line text-slate-700">{org.aboutBlurb}</p>
        )}
        {(org.website || org.contactEmail || org.contactPhone) && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
            {org.website && (
              <a href={org.website} target="_blank" rel="noreferrer" className="hover:text-slate-700">
                🌐 {org.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {org.contactEmail && (
              <a href={`mailto:${org.contactEmail}`} className="hover:text-slate-700">
                ✉ {org.contactEmail}
              </a>
            )}
            {org.contactPhone && <span>📞 {org.contactPhone}</span>}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-xl font-semibold">Upcoming events</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {org.events.map((e) => {
            const minPrice = Math.min(...e.ticketTypes.map((t) => t.priceCents));
            return (
              <Link
                key={e.id}
                href={`/o/${org.slug}/events/${e.slug}`}
                className="card transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {e.bannerUrl && (
                  <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.bannerUrl} alt={e.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--org-brand)" }}>{e.category}</div>
                <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{formatDateRange(e.startAt, e.endAt, e.timezone)}</p>
                {e.location && (<p className="mt-1 text-sm text-slate-500">{e.location.venueName ?? e.location.city}</p>)}
                <div className="mt-3 text-sm font-medium">
                  {minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}
                </div>
              </Link>
            );
          })}
          {org.events.length === 0 && (<p className="col-span-full text-slate-500">No upcoming events.</p>)}
        </div>
      </section>
    </main>
  );
}
