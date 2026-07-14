import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";
import { PublicAccountNav } from "@/components/PublicAccountNav";
import { SiteFooter } from "@/components/SiteFooter";
import { HERO } from "@/lib/homepage";
import {
  Ticket, ChevronDown, Music, UtensilsCrossed, Dumbbell, Users, Store, GraduationCap,
  Palette, Briefcase, Moon, PartyPopper, HeartHandshake, CalendarDays,
} from "lucide-react";

export const dynamic = "force-dynamic";

const EVENT_SELECT = {
  id: true, slug: true, name: true, category: true, startAt: true, endAt: true,
  timezone: true, bannerUrl: true,
  location: { select: { venueName: true, city: true, state: true } },
  ticketTypes: { select: { priceCents: true } },
  organization: {
    select: {
      name: true, slug: true,
      ratingAvg: true, reviewCount: true, reputationScore: true, fastPayoutsEnabled: true,
    },
  },
} as const;

// Map a free-text category to an icon by keyword; falls back to a calendar.
function categoryIcon(cat: string) {
  const c = cat.toLowerCase();
  if (/music|concert|band|dj/.test(c)) return Music;
  if (/food|drink|dining|tast|culinary|cook|bbq|rib/.test(c)) return UtensilsCrossed;
  if (/fitness|yoga|sport|run|workout|health|wellness|hoop/.test(c)) return Dumbbell;
  if (/community|meetup|social|civic|faith/.test(c)) return Users;
  if (/market|vendor|fair|expo|craft|flea/.test(c)) return Store;
  if (/workshop|class|course|seminar|training|education|learn/.test(c)) return GraduationCap;
  if (/art|gallery|paint|craft|design|theat|film/.test(c)) return Palette;
  if (/business|network|conference|career|profess/.test(c)) return Briefcase;
  if (/night|club|party|dance/.test(c)) return Moon;
  if (/festival|celebration|holiday/.test(c)) return PartyPopper;
  if (/charity|fundrais|benefit|gala|nonprofit/.test(c)) return HeartHandshake;
  return CalendarDays;
}

// Build a homepage URL preserving the other active facet.
function facetHref(params: { category?: string; city?: string }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.city) sp.set("city", params.city);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { category?: string; city?: string };
}) {
  const now = new Date();
  const category = (searchParams.category ?? "").trim();
  const city = (searchParams.city ?? "").trim();

  // Facets (categories + cities) come from ALL upcoming public events, so the
  // category circles and city dropdown always show the full set of options,
  // independent of the current filter.
  const facetEvents = await prisma.event.findMany({
    where: { status: "PUBLISHED", deletedAt: null, isPrivate: false, endAt: { gte: now } },
    select: { category: true, location: { select: { city: true } } },
    take: 500,
  });
  const categories = [...new Set(facetEvents.map((e) => e.category).filter(Boolean) as string[])].sort();
  const cities = [...new Set(facetEvents.map((e) => e.location?.city).filter(Boolean) as string[])].sort();

  // The filtered grid.
  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED", deletedAt: null, isPrivate: false, endAt: { gte: now },
      ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
      ...(city ? { location: { is: { city: { equals: city, mode: "insensitive" } } } } : {}),
    },
    orderBy: { startAt: "asc" },
    take: 60,
    select: EVENT_SELECT,
  });

  const gridHeading = city ? `Events in ${city}` : "Popular events";

  return (
    <main>
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Your Events home" className="text-2xl font-bold tracking-tight text-brand-700">
            Your Events
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/signup" className="hidden text-slate-600 hover:text-slate-900 sm:inline">Host an event</Link>
            <PublicAccountNav />
          </nav>
        </div>
      </header>

      {/* Hero banner — static, controlled via src/lib/homepage.ts (HERO) */}
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="relative overflow-hidden rounded-2xl">
          {HERO.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={HERO.imageUrl} alt="" className="h-[260px] w-full object-cover sm:h-[340px]" />
          ) : (
            <div className="h-[240px] w-full bg-gradient-to-br from-brand-500 to-brand-800 sm:h-[300px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10">
            <h1 className="max-w-xl text-3xl font-bold leading-tight text-white drop-shadow-md sm:text-4xl">
              {HERO.headline}
            </h1>
            <p className="mt-2 max-w-lg text-white/90 drop-shadow sm:text-lg">{HERO.subhead}</p>
            <div>
              <Link
                href={HERO.ctaHref}
                className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-slate-100"
              >
                {HERO.ctaText}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category circles */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-8">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-5 sm:gap-x-10">
            {categories.slice(0, 10).map((cat) => {
              const Icon = categoryIcon(cat);
              const active = category.toLowerCase() === cat.toLowerCase();
              return (
                <Link
                  key={cat}
                  href={active ? facetHref({ city }) : facetHref({ category: cat, city })}
                  className="group flex w-20 flex-col items-center gap-2 text-center"
                >
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full ring-1 transition ${active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 group-hover:ring-brand-300"}`}>
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="text-xs leading-tight text-slate-600">{cat}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* City filter — "Browsing events in [city] ▾" */}
      <section id="events" className="mx-auto mt-8 max-w-6xl scroll-mt-20 border-t border-slate-100 px-4 pt-6">
        {cities.length > 0 && (
          <details className="group relative inline-block">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-lg [&::-webkit-details-marker]:hidden">
              <span className="text-slate-700">Browsing events in</span>
              <span className="font-semibold text-brand-700">{city || "all cities"}</span>
              <ChevronDown className="h-4 w-4 text-brand-700 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute z-10 mt-2 max-h-72 w-56 overflow-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
              <Link href={facetHref({ category })} className={`block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 ${!city ? "font-semibold text-brand-700" : "text-slate-700"}`}>
                All cities
              </Link>
              {cities.map((c) => (
                <Link
                  key={c}
                  href={facetHref({ category, city: c })}
                  className={`block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 ${city.toLowerCase() === c.toLowerCase() ? "font-semibold text-brand-700" : "text-slate-700"}`}
                >
                  {c}
                </Link>
              ))}
            </div>
          </details>
        )}

        <div className="mt-4 flex items-baseline justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            {category ? `${category} · ${gridHeading}` : gridHeading}
          </h2>
          {(category || city) && (
            <Link href="/" className="text-sm text-brand-700 hover:underline">Clear filters</Link>
          )}
        </div>

        {events.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-8 text-center text-slate-500 ring-1 ring-slate-200">
            No upcoming events{city ? ` in ${city}` : ""}{category ? ` under ${category}` : ""} right now.{" "}
            <Link href="/" className="text-brand-700 hover:underline">See all events</Link>.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}

function EventCard({ e }: { e: any }) {
  const minPrice = e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t: any) => t.priceCents)) : 0;
  const place = [e.location?.venueName, e.location?.city, e.location?.state]
    .filter(Boolean).join(" · ");
  return (
    <Link
      href={`/o/${e.organization.slug}/events/${e.slug}`}
      className="card transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {e.bannerUrl ? (
        <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.bannerUrl} alt={e.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <Ticket className="h-8 w-8 opacity-90" aria-hidden />
        </div>
      )}
      {e.category && (
        <div className="text-xs uppercase tracking-wider text-brand-800">{e.category}</div>
      )}
      <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {formatDateRange(e.startAt, e.endAt, e.timezone)}
      </p>
      {place && <p className="mt-1 text-sm text-slate-500">{place}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        <span>by {e.organization.name}</span>
        {e.organization.reviewCount > 0 && e.organization.ratingAvg != null && (
          <span className="text-slate-600">
            <span style={{ color: "#EF9F27" }}>★</span> {Number(e.organization.ratingAvg).toFixed(1)}
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-medium">
        {minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}
      </div>
    </Link>
  );
}
