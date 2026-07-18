import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Public marketing pages, highest priority first.
const STATIC_PATHS: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
  { path: "/why", priority: 0.7, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" },
  { path: "/compare", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/guide", priority: 0.5, changeFrequency: "monthly" },
  { path: "/help", priority: 0.4, changeFrequency: "monthly" },
  { path: "/security", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * Dynamic sitemap: static pages + every PUBLIC org, upcoming/ongoing event, and
 * active/ended recurring event. PRIVATE events and recurring events are excluded
 * — they're reachable by direct link only and must never be surfaced to search.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [orgs, events, recurring] = await Promise.all([
    prisma.organization.findMany({
      where: { deletedAt: null },
      select: { slug: true, updatedAt: true },
    }),
    prisma.event.findMany({
      // Upcoming + still-relevant events only; a past event has no registration
      // value. Private events never appear.
      where: { status: "PUBLISHED", deletedAt: null, isPrivate: false, recurringEventId: null, endAt: { gte: now } },
      select: { slug: true, updatedAt: true, organization: { select: { slug: true } } },
      take: 5000,
    }),
    prisma.recurringEvent.findMany({
      where: { deletedAt: null, isPrivate: false, status: { in: ["ACTIVE", "ENDED"] } },
      select: { slug: true, updatedAt: true, organization: { select: { slug: true } } },
      take: 2000,
    }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: absoluteUrl(s.path),
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  const orgEntries: MetadataRoute.Sitemap = orgs.map((o) => ({
    url: absoluteUrl(`/o/${o.slug}`),
    lastModified: o.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const eventEntries: MetadataRoute.Sitemap = events.map((e) => ({
    url: absoluteUrl(`/o/${e.organization.slug}/events/${e.slug}`),
    lastModified: e.updatedAt,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  const recurringEntries: MetadataRoute.Sitemap = recurring.map((r) => ({
    url: absoluteUrl(`/o/${r.organization.slug}/recurring/${r.slug}`),
    lastModified: r.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...orgEntries, ...eventEntries, ...recurringEntries];
}
