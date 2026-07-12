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
    },
  });
  if (!org) return notFound();

  const now = new Date();
  // Private events show on the org's OWN page by default (never on app-wide
  // discovery). The org can opt out via settings (showPrivateEvents=false), in
  // which case a private event is reachable only through its direct link.
  const visibleEvents = org.showPrivateEvents
    ? org.events
    : org.events.filter((e) => !e.isPrivate);
  const upcoming = visibleEvents.filter((e) => e.endAt >= now);
  const past = visibleEvents
    .filter((e) => e.endAt < now)
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, 6);

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
                  🌐 {org.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {org.contactEmail && (
                <a
                  href={`mailto:${org.contactEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                >
                  ✉ {org.contactEmail}
                </a>
              )}
              {org.contactPhone && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
                  📞 {org.contactPhone}
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
                  <a href={`mailto:${m.email}`} className="mt-1 block truncate text-sm text-slate-600 hover:text-slate-900">
                    ✉ {m.email}
                  </a>
                  {m.phone && org.showTeamPhones && (
                    <a href={`tel:${m.phone}`} className="block text-sm text-slate-600 hover:text-slate-900">📞 {m.phone}</a>
                  )}
                </div>
              </div>
            ))}
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
            <div className="text-4xl">🎟️</div>
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
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-8">
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
    </main>
  );
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
          className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg text-3xl text-white"
          style={{ background: "linear-gradient(135deg, var(--org-brand), #0f172a)" }}
        >
          🎟
        </div>
      )}
      <div className="flex items-center gap-2">
        {e.category && (
          <span className="text-xs uppercase tracking-wider" style={{ color: "var(--org-brand)" }}>{e.category}</span>
        )}
        {ended && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Ended
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
      <p className="mt-1 text-sm text-slate-600">{formatDateRange(e.startAt, e.endAt, e.timezone)}</p>
      {e.location && <p className="mt-1 text-sm text-slate-500">{e.location.venueName ?? e.location.city}</p>}
      {!ended && (
        <div className="mt-3 text-sm font-medium">{minPrice === 0 ? "Free" : `From $${(minPrice / 100).toFixed(2)}`}</div>
      )}
    </Link>
  );
}
