import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";

// Re-runs on every request — guarantees fresh random selection each time
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Fetch all upcoming published events, then pick 3 at random in-memory.
  // Works well up to a few thousand events; switch to ORDER BY RANDOM() at scale.
  const candidates = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      endAt: { gte: new Date() }, // current + future
    },
    select: {
      id: true, slug: true, name: true, category: true, startAt: true, endAt: true,
      timezone: true, bannerUrl: true,
      location: { select: { venueName: true, city: true, state: true } },
      ticketTypes: { select: { priceCents: true } },
      organization: { select: { name: true, slug: true } },
    },
  });

  // Fisher–Yates shuffle, take first 3
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const featured = shuffled.slice(0, 3);

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-brand-700">
            Your Events App
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/signin">Sign in</Link>
            <Link href="/signup" className="btn-primary">Sign up — host events</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Your Events App</h1>
        <p className="mt-4 text-xl text-slate-600">
          Modern event registration, ticketing, and check-in for organizations of every size.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary">Host an event — get started</Link>
          <Link href="/signin" className="btn-secondary">Sign in</Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">Free tier available · No credit card required</p>
      </section>

      {/* Featured events — 3 random, reshuffled on every page load */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Featured upcoming events</h2>
          <span className="text-xs uppercase tracking-wider text-slate-400">refreshes on reload</span>
        </div>

        {featured.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-8 text-center text-slate-500 ring-1 ring-slate-200">
            No upcoming events to feature yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {featured.map((e) => {
              const minPrice = e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t) => t.priceCents)) : 0;
              const place = [e.location?.venueName, e.location?.city, e.location?.state]
                .filter(Boolean).join(" · ");
              return (
                <Link
                  key={e.id}
                  href={`/o/${e.organization.slug}/events/${e.slug}`}
                  className="card transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {e.bannerUrl ? (
                    <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.bannerUrl} alt={e.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-3xl text-white">
                      🎟
                    </div>
                  )}
                  {e.category && (
                    <div className="text-xs uppercase tracking-wider text-brand-700">{e.category}</div>
                  )}
                  <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDateRange(e.startAt, e.endAt, e.timezone)}
                  </p>
                  {place && <p className="mt-1 text-sm text-slate-500">{place}</p>}
                  <div className="mt-2 text-xs text-slate-400">by {e.organization.name}</div>
                  <div className="mt-3 text-sm font-medium">
                    {minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Your Events App ·{" "}
          <a href="mailto:events@yourevents.app" className="hover:text-slate-700">events@yourevents.app</a>
          {" · "}
          <a href="https://www.yourevents.app" className="hover:text-slate-700">yourevents.app</a>
        </div>
      </footer>
    </main>
  );
}
