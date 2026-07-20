import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { formatDateRange, money } from "@/lib/format";
import { ShareBar } from "@/components/ShareBar";
import { PublicAccountNav } from "@/components/PublicAccountNav";
import { OrgBrandStyle } from "@/components/OrgBrandStyle";
import { WaitlistForm } from "@/components/WaitlistForm";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl, metaDescription, eventJsonLd } from "@/lib/seo";
import { conferenceDays, dayIndexOf, dayAccessLabel } from "@/lib/conference";
import { Calendar, MapPin, PartyPopper, CalendarClock } from "lucide-react";

interface Props { params: { orgSlug: string; slug: string } }

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await prisma.event.findFirst({
    where: {
      slug: params.slug,
      organization: { slug: params.orgSlug, deletedAt: null },
      status: { in: ["PUBLISHED", "CANCELLED"] },
      deletedAt: null,
    },
    select: {
      name: true, shortDescription: true, description: true, bannerUrl: true,
      startAt: true, timezone: true, isPrivate: true,
      organization: { select: { name: true } },
    },
  });
  if (!event) return { title: "Event not found" };

  const canonical = absoluteUrl(`/o/${params.orgSlug}/events/${params.slug}`);
  const when = formatInTimeZone(event.startAt, event.timezone, "EEE, MMM d, yyyy");
  const title = `${event.name} · ${when}`;
  const description = metaDescription(
    event.shortDescription || event.description,
    `${event.name} hosted by ${event.organization.name} on ${when}. Register on YourEvents.`,
  );
  return {
    title,
    description,
    alternates: { canonical },
    // Private events are reachable by link but must never be indexed.
    robots: event.isPrivate ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      images: event.bannerUrl ? [{ url: event.bannerUrl }] : undefined,
    },
    twitter: {
      card: event.bannerUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: event.bannerUrl ? [event.bannerUrl] : undefined,
    },
  };
}

export default async function EventLandingPage({ params }: Props) {
  const event = await prisma.event.findFirst({
    where: {
      slug: params.slug,
      organization: { slug: params.orgSlug, deletedAt: null },
      // Include CANCELLED (but not soft-deleted) events so a cancelled event shows
      // the "Event cancelled" state instead of a 404.
      status: { in: ["PUBLISHED", "CANCELLED"] },
      deletedAt: null,
    },
    include: {
      organization: true,
      location: true,
      speakers: { orderBy: { order: "asc" } },
      sessions: { orderBy: [{ startAt: "asc" }, { sortOrder: "asc" }] },
      media: { orderBy: { order: "asc" } },
      tags: true,
      ticketTypes: { where: { isHidden: false }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!event) return notFound();

  // Conference days (derived in the event's tz) for the agenda + ticket labels.
  const days = conferenceDays(event);

  const visibleTickets = event.ticketTypes.filter((t) => !t.isVendorTier);
  const minPrice = visibleTickets.length ? Math.min(...visibleTickets.map((t) => t.priceCents)) : 0;
  const totalSold = event.ticketTypes.reduce((a, t) => a + t.quantitySold, 0);

  const allTicketsSoldOut = visibleTickets.length > 0 && visibleTickets.every((t) => {
    if (t.quantityTotal === null) return false;
    return t.quantitySold >= t.quantityTotal;
  });
  const capacitySoldOut = event.capacity !== null && totalSold >= event.capacity;
  const eventSoldOut = allTicketsSoldOut || capacitySoldOut;
  const showWaitlist = eventSoldOut && event.waitlistEnabled;

  // Registration closes once the event has ended (endAt in the past) or was
  // cancelled — before this a past event still rendered a live "Register Now".
  const hasEnded = event.endAt < new Date();
  const isCancelled = event.status === "CANCELLED";
  const registrationClosed = hasEnded || isCancelled;

  // Presale (early-bird) banner — only while the window is open and a paid
  // ticket exists for the discount to apply to. Date shown in the event's timezone.
  const presalePct = event.presalePercent != null ? Number(event.presalePercent) : 0;
  const presaleActive =
    presalePct > 0 &&
    event.presaleEndsAt != null &&
    event.presaleEndsAt > new Date() &&
    visibleTickets.some((t) => t.priceCents > 0);
  // Per-ticket early-bird price, mirroring computeTotals (floor of the % off).
  const presaleUnit = (cents: number) =>
    presaleActive && cents > 0 ? cents - Math.floor((cents * presalePct) / 100) : cents;

  // Single env var powers both the embedded map below and the address
  // autocomplete on /signup, /vendor signup, /register, and the team/vendor
  // edit forms. Falls back to the legacy NEXT_PUBLIC_GOOGLE_MAPS_KEY name so
  // existing Railway configs keep working until that variable is removed.
  const mapsKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
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

  // schema.org Event rich-result data — public events only (never leak a private
  // event to search). soldOut mirrors the on-page state.
  const jsonLd = event.isPrivate
    ? null
    : eventJsonLd({
        name: event.name,
        slug: event.slug,
        description: event.description,
        shortDescription: event.shortDescription,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        status: event.status,
        bannerUrl: event.bannerUrl,
        location: event.location,
        organization: { name: event.organization.name, slug: event.organization.slug },
        minPriceCents: minPrice,
        soldOut: eventSoldOut,
      });

  return (
    <main>
      {jsonLd && <JsonLd data={jsonLd} />}
      {/* Custom branding (logo + brand color) is a premium-event feature. */}
      <OrgBrandStyle color={event.isPremium ? event.organization.brandColor : null} />

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href={`/o/${event.organization.slug}`} className="flex items-center gap-2">
            {event.isPremium && event.organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.organization.logoUrl} alt={event.organization.name} className="h-7 max-w-[140px] object-contain" />
            )}
            <span className="font-bold" style={{ color: "var(--org-brand)" }}>{event.organization.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <PublicAccountNav compact />
            {!registrationClosed && (
              <Link
                href={`/o/${event.organization.slug}/events/${event.slug}/register`}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition"
                style={{ backgroundColor: "var(--org-brand)" }}
              >
                Register Now
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero — image with gradient overlay + title + meta. If no banner, a
          gradient using the org's brand color stands in. */}
      <section className="relative isolate overflow-hidden">
        <div className="aspect-[16/7] w-full sm:aspect-[16/6]">
          {event.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.bannerUrl}
              alt={event.name}
              className={`h-full w-full ${event.bannerFitToFrame ? "object-contain" : "object-cover"}`}
              style={
                event.bannerFitToFrame
                  ? undefined
                  : {
                      objectPosition: `${event.bannerPositionX}% ${event.bannerPositionY}%`,
                      transform: `scale(${event.bannerZoom})`,
                      transformOrigin: `${event.bannerPositionX}% ${event.bannerPositionY}%`,
                    }
              }
              loading="eager"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--org-brand, #1F3A8A) 0%, color-mix(in srgb, var(--org-brand, #1F3A8A) 60%, black) 100%)",
              }}
            />
          )}
          {/* Dark gradient overlay for legible text */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
        </div>

        {/* Title block laid over the hero */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-4 pb-6 sm:pb-10">
            <div className="flex flex-wrap gap-2 text-xs">
              {event.category && (
                <span className="rounded-full bg-white/90 px-2 py-0.5 font-medium" style={{ color: "var(--org-brand)" }}>
                  {event.category}
                </span>
              )}
              {event.tags.slice(0, 4).map((t) => (
                <span key={t.id} className="rounded-full bg-white/15 px-2 py-0.5 text-white backdrop-blur-sm">
                  #{t.tag}
                </span>
              ))}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white drop-shadow sm:text-5xl">
              {event.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/90 sm:text-base">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 shrink-0" aria-hidden /> {formatDateRange(event.startAt, event.endAt, event.timezone)}</span>
              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {event.location.venueName ?? ""}
                  {event.location.venueName ? " · " : ""}
                  {event.location.city}{event.location.state ? `, ${event.location.state}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-3">
        <article className="lg:col-span-2">
          {event.shortDescription && (
            <p className="text-lg font-medium leading-snug text-slate-700">{event.shortDescription}</p>
          )}
          <div className={`${event.shortDescription ? "mt-4" : ""} whitespace-pre-line text-slate-700`}>{event.description}</div>

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

          {event.sessions.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Agenda</h2>
              <div className="mt-4 space-y-8">
                {days.map((day) => {
                  const daySessions = event.sessions.filter((s) => dayIndexOf(s.startAt, event) === day.index);
                  if (daySessions.length === 0) return null;
                  return (
                    <div key={day.index}>
                      {days.length > 1 && (
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
                          Day {day.index} · {day.label}
                        </h3>
                      )}
                      <ul className={`${days.length > 1 ? "mt-3" : ""} space-y-3`}>
                        {daySessions.map((s) => (
                          <li key={s.id} className="rounded-xl p-4 ring-1 ring-slate-200">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <span className="font-medium">{s.title}</span>
                              <span className="text-sm tabular-nums text-slate-500">
                                {formatInTimeZone(s.startAt, event.timezone, "h:mm a")}
                                {" – "}
                                {formatInTimeZone(s.endAt, event.timezone, "h:mm a")}
                              </span>
                            </div>
                            {(s.track || s.room || s.speaker) && (
                              <div className="mt-1 text-sm text-slate-500">
                                {[s.track, s.room, s.speaker].filter(Boolean).join(" · ")}
                              </div>
                            )}
                            {s.description && <p className="mt-2 text-sm text-slate-600">{s.description}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
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
                  <MapPin className="h-6 w-6 text-slate-500" aria-hidden />
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
          {presaleActive && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <PartyPopper className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              <p className="text-sm font-bold text-emerald-800">
                All tickets shown include a {presalePct}% early-bird discount until{" "}
                {formatInTimeZone(event.presaleEndsAt!, event.timezone, "MMM d, h:mm a zzz")} — prices return to regular after that.
              </p>
            </div>
          )}
          <div className="card">
            <div className="text-sm text-slate-500">From</div>
            {presaleActive && minPrice > 0 ? (
              <div className="text-3xl font-bold">
                <span className="mr-2 text-xl font-medium text-slate-400 line-through">{money(minPrice)}</span>
                {money(presaleUnit(minPrice))}
              </div>
            ) : (
              <div className="text-3xl font-bold">{minPrice === 0 ? "Free" : money(minPrice)}</div>
            )}

            <div className="mt-4 space-y-2">
              {visibleTickets.map((t) => {
                const left = t.quantityTotal ? t.quantityTotal - t.quantitySold : null;
                const soldOut = left !== null && left <= 0;
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-lg ring-1 ring-slate-200 p-3">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      {days.length > 1 && (
                        <div className="text-xs font-medium text-brand-700">{dayAccessLabel(t.dayAccess, days)}</div>
                      )}
                      <div className="text-xs text-slate-500">
                        {soldOut ? "Sold out" : left !== null ? `${left} left` : "Available"}
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium">
                      {t.priceCents === 0 ? (
                        "Free"
                      ) : presaleActive ? (
                        <>
                          <span className="mr-1 text-slate-400 line-through">{money(t.priceCents)}</span>
                          <span className="text-emerald-700">{money(presaleUnit(t.priceCents))}</span>
                        </>
                      ) : (
                        money(t.priceCents)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {event.organization.passProcessingFee && visibleTickets.some((t) => t.priceCents > 0) && (
              <p className="mt-3 text-xs text-slate-500">
                A payment processing fee (2.9% + $0.30, charged by Stripe) is added at checkout for paid tickets.
              </p>
            )}

            {isCancelled ? (
              <div className="mt-4 rounded-lg bg-rose-50 p-4 text-center ring-1 ring-rose-200">
                <div className="text-sm font-semibold text-rose-800">Event cancelled</div>
                <p className="mt-1 text-xs text-rose-700">This event has been cancelled — registration is closed.</p>
              </div>
            ) : hasEnded ? (
              <div className="mt-4 rounded-lg bg-slate-100 p-4 text-center ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-700">Event completed</div>
                <p className="mt-1 text-xs text-slate-500">This event has ended — registration is closed.</p>
              </div>
            ) : showWaitlist ? (
              <>
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-center text-sm text-amber-800 ring-1 ring-amber-200">
                  This event is sold out
                </div>
                <WaitlistForm eventId={event.id} />
              </>
            ) : (
              <Link
                href={`/o/${event.organization.slug}/events/${event.slug}/register`}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--org-brand)" }}
              >
                {eventSoldOut ? "Sold Out" : "Register Now"}
              </Link>
            )}

            <div className="mt-3 text-center text-xs text-slate-500">
              {totalSold} registered{event.capacity ? ` · capacity ${event.capacity}` : ""}
            </div>

            {event.vendorRegistrationEnabled && !registrationClosed && (
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
