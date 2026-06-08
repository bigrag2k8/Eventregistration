import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateRange, money } from "@/lib/format";
import { ShareBar } from "@/components/ShareBar";

interface Props { params: { orgSlug: string; slug: string } }

export const dynamic = "force-dynamic";

export default async function EventLandingPage({ params }: Props) {
  const event = await prisma.event.findFirst({
    where: {
      slug: params.slug,
      organization: { slug: params.orgSlug, deletedAt: null },
      status: "PUBLISHED",
      deletedAt: null,
    },
    include: {
      organization: true,
      location: true,
      speakers: { orderBy: { order: "asc" } },
      media: { orderBy: { order: "asc" } },
      tags: true,
      ticketTypes: { where: { isHidden: false }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!event) return notFound();

  const visibleTickets = event.ticketTypes.filter((t) => !t.isVendorTier);
  const minPrice = visibleTickets.length ? Math.min(...visibleTickets.map((t) => t.priceCents)) : 0;
  const totalSold = event.ticketTypes.reduce((a, t) => a + t.quantitySold, 0);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const mapsSrc = event.location && mapsKey
    ? `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(
        `${event.location.addressLine1}, ${event.location.city}`
      )}`
    : null;
  const directionsHref = event.location
    ? event.location.latitude && event.location.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.location.latitude},${event.location.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${event.location.addressLine1}, ${event.location.city}${event.location.state ? ", " + event.location.state : ""}`
        )}`
    : null;

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href={`/o/${event.organization.slug}`} className="font-bold text-brand-700">
            {event.organization.name}
          </Link>
          <Link href={`/o/${event.organization.slug}/events/${event.slug}/register`} className="btn-primary">
            Register Now
          </Link>
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
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{event.category}</span>
            )}
            {event.tags.map((t) => (
              <span key={t.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">#{t.tag}</span>
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{event.name}</h1>
          <p className="mt-2 text-slate-600">📅 {formatDateRange(event.startAt, event.endAt, event.timezone)}</p>
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

          {event.location && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Location</h2>
              {mapsSrc ? (
                <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <iframe src={mapsSrc} className="h-72 w-full" loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
                  <div className="text-2xl">📍</div>
                  {event.location.venueName && <div className="mt-2 font-semibold">{event.location.venueName}</div>}
                  <div className="text-slate-700">
                    {event.location.addressLine1}{event.location.addressLine2 ? `, ${event.location.addressLine2}` : ""}
                  </div>
                  <div className="text-slate-700">
                    {event.location.city}{event.location.state ? `, ${event.location.state}` : ""}
                    {event.location.postalCode ? ` ${event.location.postalCode}` : ""}
                  </div>
                  {directionsHref && (
                    <a className="btn-primary mt-4 inline-flex" href={directionsHref} target="_blank" rel="noreferrer">
                      Open in Google Maps ↗
                    </a>
                  )}
                </div>
              )}
              {mapsSrc && directionsHref && (
                <a className="mt-2 inline-block text-sm text-brand-700 hover:underline"
                   href={directionsHref} target="_blank" rel="noreferrer">Get directions ↗</a>
              )}
            </section>
          )}

          <ShareBar url={`${process.env.NEXT_PUBLIC_APP_URL}/o/${event.organization.slug}/events/${event.slug}`} name={event.name} />
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card">
            <div className="text-sm text-slate-500">From</div>
            <div className="text-3xl font-bold">{minPrice === 0 ? "Free" : money(minPrice)}</div>

            <div className="mt-4 space-y-2">
              {visibleTickets.map((t) => {
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

            <Link href={`/o/${event.organization.slug}/events/${event.slug}/register`} className="btn-primary mt-4 w-full">
              Register Now
            </Link>

            <div className="mt-3 text-center text-xs text-slate-500">
              {totalSold} registered{event.capacity ? ` · capacity ${event.capacity}` : ""}
            </div>

            {event.vendorRegistrationEnabled && (
              <Link href={`/o/${event.organization.slug}/events/${event.slug}/vendors`} className="btn-secondary mt-3 w-full">
                🏪 Become a Vendor
              </Link>
            )}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Hosted by <span className="font-medium text-slate-700">{event.organization.name}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
