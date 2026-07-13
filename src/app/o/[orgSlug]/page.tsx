import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";
import { OrgBrandStyle } from "@/components/OrgBrandStyle";
import { computeTrustTier, TIER_LABEL } from "@/server/reviews";
import { describeRecurrence } from "@/server/series-rule";
import { CalendarClock, Globe, Mail, Phone, Ticket, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrgPublicPage({ params }: { params: { orgSlug: string } }) {
  const org = await prisma.organization.findFirst({
    where: { slug: params.orgSlug, deletedAt: null },
    include: {
      // Fetch all this org's published events (public AND private) — the
      // organizer's OWN landing page shows them all. "Private" only hides an
      // event from the app-wide home/discovery listings (see src/app/page.tsx),
      // not from the organizer's page. Split into upcoming/past below.
      events: {
        where: { status: "PUBLISHED", deletedAt: null },
        orderBy: { startAt: "asc" },
        include: { location: true, ticketTypes: true },
        take: 100,
      },
      // Organizers/admins shown publicly as the people behind the org.
      members: {
        where: { role: { in: ["ORGANIZER", "ADMIN"] }, deletedAt: null },
        select: { firstName: true, lastName: true, email: true, phone: true },
        orderBy: { createdAt: "asc" },
      },
      // Recent published reviews (verified attendees). The rating aggregate is
      // read from org.ratingAvg / org.reviewCount (cached). The event name is
      // shown only for non-private events so a private event isn't outed here.
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { event: { select: { name: true, isPrivate: true } } },
      },
      // Recurring series shown as ONE card each (their occurrences are filtered
      // out of the individual event lists below). Includes the next upcoming
      // session so the card can show "next: <date>".
      eventSeries: {
        where: { status: { in: ["ACTIVE", "ENDED"] }, deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          events: {
            where: { status: "PUBLISHED", deletedAt: null, endAt: { gte: new Date() } },
            orderBy: { startAt: "asc" },
            take: 1,
            select: { startAt: true, endAt: true, timezone: true },
          },
        },
      },
    },
  });
  if (!org) return notFound();

  const now = new Date();
  // Private events show on the org's OWN page by default (never on app-wide
  // discovery). The org can opt out via settings (showPrivateEvents=false), in
  // which case a private event is reachable only through its direct link.
  // Occurrences of a recurring series (seriesId set) are collapsed into their
  // series card below, so they're excluded from the individual event lists.
  const visibleEvents = (org.showPrivateEvents ? org.events : org.events.filter((e) => !e.isPrivate))
    .filter((e) => !e.seriesId);
  const series = org.showPrivateEvents ? org.eventSeries : org.eventSeries.filter((s) => !s.isPrivate);
  const upcoming = visibleEvents.filter((e) => e.endAt >= now);
  const past = visibleEvents
    .filter((e) => e.endAt < now)
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, 6);

  // Cached rating aggregate (recomputed on each review). null count → new org.
  const ratingAvg = org.ratingAvg != null ? Number(org.ratingAvg) : null;
  const reviewCount = org.reviewCount;
  // Trust tier ladder (NEW/VERIFIED/TRUSTED/TOP_RATED) — derived from the cached
  // reputation score + payout graduation. NEW renders no badge.
  const tier = computeTrustTier(org);
  const tierLabel = TIER_LABEL[tier];

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

      {/* Hero: banner (or brand gradient) with the org identity overlaid on it */}
      <div className="relative bg-slate-900">
        {org.bannerUrl ? (
          <div className="aspect-[16/5] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={org.bannerUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="aspect-[16/6] w-full sm:aspect-[16/4]"
            style={{ background: "linear-gradient(135deg, var(--org-brand), #0f172a)" }}
          />
        )}
        {/* Scrim so the name is readable over any image */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-6xl items-end gap-4 px-4 pb-5 sm:pb-6">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={org.name}
                className="hidden h-20 w-20 shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-lg ring-1 ring-white/40 sm:block"
              />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-bold tracking-tight text-white drop-shadow-md sm:text-4xl">
                {org.name}
              </h1>
              {org.tagline && <p className="mt-1 text-white/90 drop-shadow">{org.tagline}</p>}
              {(reviewCount > 0 || tierLabel) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-white/95 drop-shadow">
                  {reviewCount > 0 && ratingAvg != null && (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span style={{ color: "#FBBF24" }}>★</span>
                      <span className="font-semibold">{ratingAvg.toFixed(1)}</span>
                      <span className="text-white/75">({reviewCount} review{reviewCount === 1 ? "" : "s"})</span>
                    </span>
                  )}
                  {tierLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs ring-1 ring-white/25">
                      {tier === "TOP_RATED" ? <Trophy className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden>✓</span>} {tierLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* About + contact */}
      {(org.aboutBlurb || org.website || org.contactEmail || org.contactPhone) && (
        <section className="mx-auto max-w-6xl px-4 py-8">
          {org.aboutBlurb && (
            <p className="max-w-3xl whitespace-pre-line leading-relaxed text-slate-700">{org.aboutBlurb}</p>
          )}
          {(org.website || org.contactEmail || org.contactPhone) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {org.website && (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                >
                  <Globe className="h-4 w-4 shrink-0" aria-hidden /> {org.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {org.contactEmail && (
                <a
                  href={`mailto:${org.contactEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden /> {org.contactEmail}
                </a>
              )}
              {org.contactPhone && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden /> {org.contactPhone}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* Organizers — the people behind the org */}
      {org.members.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-2 pt-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Organizers</h2>
            <div className="h-px flex-1" style={{ background: "linear-gradient(to right, var(--org-brand), transparent)" }} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {org.members.map((m) => (
              <div key={m.email} className="card flex items-start gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: "var(--org-brand)" }}
                >
                  {initials(m.firstName, m.lastName)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}</div>
                  <a href={`mailto:${m.email}`} className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600 hover:text-slate-900">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> {m.email}
                  </a>
                  {m.phone && org.showTeamPhones && (
                    <a href={`tel:${m.phone}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> {m.phone}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Classes & series — each recurring series collapses to one card */}
      {series.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-2 pt-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Classes &amp; series</h2>
            <div className="h-px flex-1" style={{ background: "linear-gradient(to right, var(--org-brand), transparent)" }} />
          </div>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s) => {
              const next = s.events[0];
              return (
                <Link key={s.id} href={`/o/${org.slug}/series/${s.slug}`} className="card transition hover:-translate-y-0.5 hover:shadow-md">
                  {s.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.bannerUrl} alt={s.name} className="mb-3 aspect-video w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg, var(--org-brand), #0f172a)" }}>
                      <CalendarClock className="h-8 w-8 opacity-90" aria-hidden />
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider" style={{ color: "var(--org-brand)" }}>
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Series
                  </div>
                  <h3 className="mt-1 text-lg font-semibold">{s.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{describeRecurrence(s)}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {next ? `Next: ${formatDateRange(next.startAt, next.endAt, next.timezone)}` : "No upcoming sessions"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Upcoming events</h2>
          <div className="h-px flex-1" style={{ background: "linear-gradient(to right, var(--org-brand), transparent)" }} />
        </div>
        {upcoming.length > 0 ? (
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => (
              <EventCard key={e.id} e={e} orgSlug={org.slug} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Ticket className="mx-auto h-9 w-9 text-slate-400" aria-hidden />
            <p className="mt-3 font-medium text-slate-700">No upcoming events right now</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Check back soon{org.contactEmail ? " — or reach out to hear about the next one." : "."}
            </p>
            {org.contactEmail && (
              <a
                href={`mailto:${org.contactEmail}`}
                className="mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--org-brand)" }}
              >
                Get in touch
              </a>
            )}
          </div>
        )}
      </section>

      {/* Past events — the org's track record */}
      {past.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-8 pt-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-700">Past events</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((e) => (
              <EventCard key={e.id} e={e} orgSlug={org.slug} ended />
            ))}
          </div>
        </section>
      )}

      {/* Reviews — from verified attendees only */}
      {org.reviews.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">
              Reviews{reviewCount > 0 && ratingAvg != null ? ` · ★ ${ratingAvg.toFixed(1)}` : ""}
            </h2>
            <div className="h-px flex-1" style={{ background: "linear-gradient(to right, var(--org-brand), transparent)" }} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {org.reviews.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                    {reviewInitials(r.authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{r.authorName}</span>
                      <Stars n={r.rating} />
                      {r.attended && <span className="text-[11px] text-emerald-600">✓ Attended</span>}
                    </div>
                    {!r.event.isPrivate && (
                      <div className="mt-0.5 text-xs text-slate-400">{r.event.name}</div>
                    )}
                    {r.comment && (
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{r.comment}</p>
                    )}
                    {r.organizerReply && (
                      <div className="mt-2.5 border-l-2 pl-3" style={{ borderColor: "var(--org-brand)" }}>
                        <div className="text-xs font-medium text-slate-700">
                          {org.name} <span className="font-normal text-slate-400">· organizer reply</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">{r.organizerReply}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: "#EF9F27", fontSize: "13px", letterSpacing: "1px" }} aria-label={`${n} out of 5 stars`}>
      {"★".repeat(n)}
      <span style={{ color: "#cbd5e1" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

function reviewInitials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const i = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return i.toUpperCase() || "•";
}

function initials(first?: string | null, last?: string | null) {
  const i = ((first ?? "").trim()[0] ?? "") + ((last ?? "").trim()[0] ?? "");
  return i.toUpperCase() || "•";
}

function EventCard({ e, orgSlug, ended = false }: { e: any; orgSlug: string; ended?: boolean }) {
  const minPrice = e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t: any) => t.priceCents)) : 0;
  return (
    <Link
      href={`/o/${orgSlug}/events/${e.slug}`}
      className={`card transition hover:-translate-y-0.5 hover:shadow-md ${ended ? "opacity-80 hover:opacity-100" : ""}`}
    >
      {e.bannerUrl ? (
        <div className="mb-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.bannerUrl} alt={e.name} className={`h-full w-full object-cover ${ended ? "grayscale-[35%]" : ""}`} />
        </div>
      ) : (
        <div
          className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg text-white"
          style={{ background: "linear-gradient(135deg, var(--org-brand), #0f172a)" }}
        >
          <Ticket className="h-8 w-8 opacity-90" aria-hidden />
        </div>
      )}
      <div className="flex items-center gap-2">
        {e.category && (
          <span className="text-xs uppercase tracking-wider" style={{ color: "var(--org-brand)" }}>{e.category}</span>
        )}
        {ended && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-slate-600">
            Ended
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
      <p className="mt-1 text-sm text-slate-600">{formatDateRange(e.startAt, e.endAt, e.timezone)}</p>
      {e.location && <p className="mt-1 text-sm text-slate-500">{e.location.venueName ?? e.location.city}</p>}
      {e.reviewCount > 0 && e.ratingAvg != null && (
        <p className="mt-1 text-sm">
          <span style={{ color: "#EF9F27" }}>★</span>{" "}
          <span className="font-medium">{Number(e.ratingAvg).toFixed(1)}</span>{" "}
          <span className="text-slate-400">({e.reviewCount})</span>
        </p>
      )}
      {!ended && (
        <div className="mt-3 text-sm font-medium">{minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}</div>
      )}
    </Link>
  );
}
