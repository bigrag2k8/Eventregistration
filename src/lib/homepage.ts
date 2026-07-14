/**
 * Homepage hero banner — the big promotional image + headline + button at the
 * top of the public landing page (Eventbrite-style).
 *
 * This is the "static banner you control" for now: edit the values below to
 * change it. `imageUrl` can point to any public image (e.g. a Cloudinary upload
 * or /public asset) — when empty, the hero renders a clean branded gradient
 * instead of a photo. A dashboard editor to change this without code is a
 * planned follow-up (would move these fields into a SiteSetting row).
 */
export interface HeroConfig {
  /** Public URL of the banner photo. Empty string = branded gradient, no photo. */
  imageUrl: string;
  headline: string;
  subhead: string;
  ctaText: string;
  /** Where the button goes. "#events" scrolls to the event grid. */
  ctaHref: string;
  /** Banner framing (CSS-only, same as per-event banners). */
  positionX: number;
  positionY: number;
  zoom: number;
  fitToFrame: boolean;
}

/** Code defaults — used for any hero field a SUPERADMIN hasn't set at /admin. */
export const HERO: HeroConfig = {
  imageUrl: "",
  headline: "Discover events near you",
  subhead: "Workshops, markets, classes, fundraisers, and more — from local organizers you can trust.",
  ctaText: "Browse events",
  ctaHref: "#events",
  positionX: 50,
  positionY: 50,
  zoom: 1,
  fitToFrame: false,
};

/**
 * The effective hero for the public homepage: SUPERADMIN-set values from
 * PlatformConfig, falling back to the HERO code defaults per field. Empty
 * strings count as "unset" so clearing a field in the editor restores the
 * default. Reads are cheap (one singleton row) and the homepage is dynamic.
 */
export async function getHomepageHero(): Promise<HeroConfig> {
  // Local import avoids pulling prisma into modules that only want HERO/types.
  const { prisma } = await import("@/lib/db");
  let cfg: {
    heroImageUrl: string | null; heroHeadline: string | null; heroSubhead: string | null;
    heroCtaText: string | null; heroCtaHref: string | null;
    heroPositionX: number; heroPositionY: number; heroZoom: number; heroFitToFrame: boolean;
  } | null = null;
  try {
    cfg = await prisma.platformConfig.findUnique({
      where: { id: "singleton" },
      select: {
        heroImageUrl: true, heroHeadline: true, heroSubhead: true, heroCtaText: true, heroCtaHref: true,
        heroPositionX: true, heroPositionY: true, heroZoom: true, heroFitToFrame: true,
      },
    });
  } catch {
    // DB hiccup — fall back to defaults rather than break the homepage.
  }
  const pick = (v: string | null | undefined, fallback: string) => (v && v.trim() ? v : fallback);
  return {
    imageUrl: pick(cfg?.heroImageUrl, HERO.imageUrl),
    headline: pick(cfg?.heroHeadline, HERO.headline),
    subhead: pick(cfg?.heroSubhead, HERO.subhead),
    ctaText: pick(cfg?.heroCtaText, HERO.ctaText),
    ctaHref: pick(cfg?.heroCtaHref, HERO.ctaHref),
    positionX: cfg?.heroPositionX ?? HERO.positionX,
    positionY: cfg?.heroPositionY ?? HERO.positionY,
    zoom: cfg?.heroZoom ?? HERO.zoom,
    fitToFrame: cfg?.heroFitToFrame ?? HERO.fitToFrame,
  };
}
