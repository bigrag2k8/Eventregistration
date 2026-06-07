import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateRange, money } from "@/lib/format";
import { ShareBar } from "@/components/ShareBar";

interface Props { params: { slug: string } }

export const dynamic = "force-dynamic";

export default async function EventLandingPage({ params }: Props) {
  const event = await prisma.event.findFirst({
    where: { slug: params.slug, status: "PUBLISHED", deletedAt: null },
    include: {
      organization: true,
      location: true,
      speakers: { orderBy: { order: "asc" } },
      media: { orderBy: { order: "asc" } },
      tags: true,
      ticketTypes: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!event) return notFound();

  const minPrice = Math.min(...event.ticketTypes.map((t) => t.priceCents));
  const totalSold = event.ticketTypes.reduce((a, t) => a + t.quantitySold, 0);

  const mapsSrc = event.location
    ? `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(
        `${event.location.addressLine1}, ${event.location.city}`
      )}`
    : null;

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-brand-700">Automated I.T. Solutions Events APP</Link>
          <Link href={`/events/${event.slug}/register`} className="btn-primary">Register Now</Link>
        </div>
      </header>

      {event.bannerUrl && (
        <div className="aspect-[16/6] w-full overflow-hidden bg-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.bannerUrl} alt={event.name} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-3">
        <article className="lg:col-span-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {event.category && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                {event.category}
              </span>
            )}
            {event.tags.map((t) => (
              <span key={t.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                #{t.tag}
              </span>
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{event.name}</h1>
          <p className="mt-2 text-slate-600">
            📅 {formatDateRange(event.startAt, event.endAt, event.timezone)}
          </p>
          {event.location && (
            <p className="mt-1 text-slate-600">
              📍 {event.location.venueName ?? ""} {event.location.addressLine1}, {event.location.city}
            </p>
          )}

          <div className="mt-6 whitespace-pre-line text-slate-700">{event.description}</div>

          {event.speakers.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Speakers</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {event.speakers.map((s) => (
                  <div key={s.id} className="card">
                    {s.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photoUrl} alt={s.name} className="mb-3 h-20 w-20 rounded-full object-cover" />
                    )}
                    <div className="font-medium">{s.name}</div>
                    {s.title && <div className="text-sm text-slate-500">{s.title}</div>}
                    {s.bio && <p className="mt-2 text-sm text-slate-600">{s.bio}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {mapsSrc && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Location</h2>
              <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
                <iframe
                  src={mapsSrc}
                  className="h-72 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
              <a
                className="mt-2 inline-block text-sm text-brand-700 hover:underline"
                href={`https://www.google.com/maps/dir/?api=1&destination=${event.location!.latitude},${event.location!.longitude}`}
                target="_blank" rel="noreferrer"
              >
                Get directions ↗
              </a>
            </section>
          )}

          <ShareBar url={`${process.env.NEXT_PUBLIC_APP_URL}/events/${event.slug}`} name={event.name} />
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card">
            <div className="text-sm text-slate-500">From</div>
            <div className="text-3xl font-bold">
              {minPrice === 0 ? "Free" : money(minPrice)}
            </div>

            <div className="mt-4 space-y-2">
              {event.ticketTypes.map((t) => {
                const left = t.quantityTotal ? t.quantityTotal - t.quantitySold : null;
                const soldOut = left !== null && left <= 0;
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-lg ring-1 ring-slate-200 p-3">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        {soldOut ? "Sold out" : left !== null ? `${left} left` : "Available"}
                      </div>
                    </div>
                    <div className="text-sm font-medium">
                      {t.priceCents === 0 ? "Free" : money(t.priceCents)}
                    </div>
                  </div>
                );
              })}
            </div>

            <Link
              href={`/events/${event.slug}/register`}
              className="btn-primary mt-4 w-full"
            >
              Register Now
            </Link>

            <div className="mt-3 text-center text-xs text-slate-500">
              {totalSold} registered{event.capacity ? ` · capacity ${event.capacity}` : ""}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Hosted by <span className="font-medium text-slate-700">{event.organization.name}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
