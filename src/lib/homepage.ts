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
}

export const HERO: HeroConfig = {
  imageUrl: "",
  headline: "Discover events near you",
  subhead: "Workshops, markets, classes, fundraisers, and more — from local organizers you can trust.",
  ctaText: "Browse events",
  ctaHref: "#events",
};
