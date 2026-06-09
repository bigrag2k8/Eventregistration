import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Technology", "Business", "Education", "Health & Wellness",
  "Arts", "Music", "Sports", "Community", "Nonprofit",
  "Networking", "Workshop", "Conference", "Training", "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface SP {
  q?: string;
  category?: string;
  city?: string;
  state?: string;
  from?: string;
  to?: string;
}

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  const { q, category, city, state, from, to } = searchParams;
  const hasFilters = !!(q || category || city || state || from || to);

  const now = new Date();
  const fromDate = from ? new Date(from) : now;
  const toDate = to ? new Date(to) : undefined;

  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      startAt: {
        gte: fromDate,
        ...(toDate ? { lte: toDate } : {}),
      },
      ...(q && { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { shortDescription: { contains: q, mode: "insensitive" } },
      ]}),
      ...(category && { category }),
      ...(city && { location: { is: { city: { contains: city, mode: "insensitive" } } } }),
      ...(state && { location: { is: { state } } }),
    },
    include: { organization: true, location: true, ticketTypes: true },
    orderBy: { startAt: "asc" },
    take: 60,
  });

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-brand-700">Your Events App</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/signin">Sign in</Link>
            <Link href="/signup" className="btn-primary">Sign up — host events</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Find your next event</h1>
          <p className="mt-2 text-slate-600">Search across workshops, conferences, fundraisers, and more.</p>
        </div>
      </section>

      {/* Search filters */}
      <section className="mx-auto -mt-8 max-w-6xl px-4">
        <form className="card grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label className="label">Search</label>
            <input
              name="q"
              defaultValue={q ?? ""}
              className="input"
              placeholder="Event name or keyword…"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Category</label>
            <select name="category" defaultValue={category ?? ""} className="input">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label">City</label>
            <input name="city" defaultValue={city ?? ""} className="input" placeholder="San Francisco" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">State</label>
            <select name="state" defaultValue={state ?? ""} className="input">
              <option value="">All</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="label">From date</label>
            <input name="from" type="date" defaultValue={from ?? ""} className="input" />
          </div>
          <div className="sm:col-span-3">
            <label className="label">To date</label>
            <input name="to" type="date" defaultValue={to ?? ""} className="input" />
          </div>

          <div className="sm:col-span-6 flex items-end justify-end gap-2">
            {hasFilters && (
              <Link href="/" className="btn-secondary">Clear</Link>
            )}
            <button type="submit" className="btn-primary">Search events</button>
          </div>
        </form>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {hasFilters ? `${events.length} event${events.length === 1 ? "" : "s"} found` : "Upcoming events"}
          </h2>
          {events.length === 60 && (
            <span className="text-xs text-slate-500">Showing first 60 — narrow your search to see more</span>
          )}
        </div>

        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const minPrice = e.ticketTypes.length
              ? Math.min(...e.ticketTypes.map((t) => t.priceCents))
              : 0;
            return (
              <Link
                key={e.id}
                href={`/o/${e.organization.slug}/events/${e.slug}`}
                className="card transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {e.bannerUrl && (
                  <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.bannerUrl} alt={e.name} className="h-full w-full object-cover" />
                  </div>
                )}
                {e.category && (
                  <div className="text-xs uppercase tracking-wider text-brand-700">{e.category}</div>
                )}
                <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{formatDateRange(e.startAt, e.endAt, e.timezone)}</p>
                {e.location && (
                  <p className="mt-1 text-sm text-slate-500">
                    {e.location.venueName ? `${e.location.venueName} · ` : ""}
                    {e.location.city}
                    {e.location.state ? `, ${e.location.state}` : ""}
                  </p>
                )}
                <div className="mt-2 text-xs text-slate-400">by {e.organization.name}</div>
                <div className="mt-3 text-sm font-medium">
                  {minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}
                </div>
              </Link>
            );
          })}
          {events.length === 0 && (
            <div className="col-span-full rounded-xl bg-slate-50 p-12 text-center ring-1 ring-slate-200">
              <div className="text-4xl">🔍</div>
              <h3 className="mt-3 text-lg font-semibold">No events match your search</h3>
              <p className="mt-1 text-sm text-slate-600">
                Try removing some filters, or check back later.
              </p>
              {hasFilters && (
                <Link href="/" className="btn-secondary mt-4 inline-block">Clear filters</Link>
              )}
            </div>
          )}
        </div>
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
