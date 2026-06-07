import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED", deletedAt: null, startAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    include: { location: true, ticketTypes: true },
    take: 24,
  });

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-brand-700">Automated I.T. Solutions Events APP</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/events">Browse</Link>
            <Link href="/signin">Sign in</Link>
            <Link href="/dashboard" className="btn-primary">Create event</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight">Find your next event</h1>
        <p className="mt-2 text-slate-600">From workshops to summits — free and paid.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const minPrice = Math.min(...e.ticketTypes.map((t) => t.priceCents));
            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="card transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {e.bannerUrl && (
                  <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.bannerUrl} alt={e.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="text-xs uppercase tracking-wider text-brand-700">
                  {e.category}
                </div>
                <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDateRange(e.startAt, e.endAt, e.timezone)}
                </p>
                {e.location && (
                  <p className="mt-1 text-sm text-slate-500">
                    {e.location.venueName ?? e.location.city}
                  </p>
                )}
                <div className="mt-3 text-sm font-medium">
                  {minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}
                </div>
              </Link>
            );
          })}
          {events.length === 0 && (
            <p className="col-span-full text-slate-500">No upcoming events yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
