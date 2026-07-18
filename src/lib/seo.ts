import { formatInTimeZone } from "date-fns-tz";

/**
 * Canonical site origin for absolute URLs in metadata, sitemaps and JSON-LD.
 * Must be the www host (non-www 405s on POST and isn't the canonical domain).
 */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app").replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Trim + collapse a description to a clean meta length (~160 chars). */
export function metaDescription(raw: string | null | undefined, fallback: string): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

type EventForJsonLd = {
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: string;
  bannerUrl: string | null;
  location: {
    isVirtual: boolean;
    virtualUrl: string | null;
    venueName: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string | null;
    postalCode: string | null;
    country: string;
  } | null;
  organization: { name: string; slug: string };
  minPriceCents: number;
  soldOut: boolean;
  currency?: string;
};

/**
 * schema.org/Event JSON-LD for a public event page — this is what earns the
 * Google "event" rich result (the card with date, venue, and price). Dates are
 * emitted in the event's own timezone WITH offset, which is what Google wants;
 * a bare UTC "Z" reads as the wrong local time to searchers.
 */
export function eventJsonLd(e: EventForJsonLd): Record<string, unknown> {
  const url = absoluteUrl(`/o/${e.organization.slug}/events/${e.slug}`);
  const iso = (d: Date) => formatInTimeZone(d, e.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const currency = e.currency ?? "USD";

  const location = e.location?.isVirtual
    ? { "@type": "VirtualLocation", url: e.location.virtualUrl || url }
    : e.location
      ? {
          "@type": "Place",
          name: e.location.venueName || e.location.addressLine1,
          address: {
            "@type": "PostalAddress",
            streetAddress: [e.location.addressLine1, e.location.addressLine2].filter(Boolean).join(", "),
            addressLocality: e.location.city,
            addressRegion: e.location.state || undefined,
            postalCode: e.location.postalCode || undefined,
            addressCountry: e.location.country || "US",
          },
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    description: metaDescription(e.shortDescription || e.description, `${e.name} — hosted by ${e.organization.name}.`),
    startDate: iso(e.startAt),
    endDate: iso(e.endAt),
    eventStatus: e.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: e.location?.isVirtual
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    ...(location ? { location } : {}),
    ...(e.bannerUrl ? { image: [e.bannerUrl] } : {}),
    url,
    organizer: { "@type": "Organization", name: e.organization.name, url: absoluteUrl(`/o/${e.organization.slug}`) },
    offers: {
      "@type": "Offer",
      url,
      price: (e.minPriceCents / 100).toFixed(2),
      priceCurrency: currency,
      availability: e.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      validFrom: iso(new Date()),
    },
  };
}

/** schema.org/Organization JSON-LD for a public org page. */
export function organizationJsonLd(o: {
  name: string;
  slug: string;
  tagline: string | null;
  aboutBlurb: string | null;
  logoUrl: string | null;
  website: string | null;
  ratingAvg: number | null;
  reviewCount: number;
}): Record<string, unknown> {
  const url = absoluteUrl(`/o/${o.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: o.name,
    url,
    ...(o.logoUrl ? { logo: o.logoUrl } : {}),
    ...(o.website ? { sameAs: [o.website] } : {}),
    description: metaDescription(o.aboutBlurb || o.tagline, `${o.name} on YourEvents.`),
    ...(o.reviewCount > 0 && o.ratingAvg
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(o.ratingAvg).toFixed(1),
            reviewCount: o.reviewCount,
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
  };
}
