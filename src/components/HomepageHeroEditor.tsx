import { updateHomepageHeroAction } from "@/app/admin/hero/actions";
import { BannerImageInput } from "@/components/BannerImageInput";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * SUPERADMIN card for editing the public homepage hero banner. Server component
 * wrapping a server-action form; the image field is the shared banner uploader
 * with drag-to-reposition, zoom, fit-to-frame, and reset. Any field left blank
 * falls back to the code default on the homepage.
 */
export function HomepageHeroEditor({
  hero,
}: {
  hero: {
    heroImageUrl: string | null; heroHeadline: string | null; heroSubhead: string | null;
    heroCtaText: string | null; heroCtaHref: string | null;
    heroPositionX: number; heroPositionY: number; heroZoom: number; heroFitToFrame: boolean;
  };
}) {
  return (
    <form action={updateHomepageHeroAction} className="grid gap-4">
      <BannerImageInput
        name="heroImageUrl"
        defaultUrl={hero.heroImageUrl}
        defaultPositionX={hero.heroPositionX}
        defaultPositionY={hero.heroPositionY}
        defaultZoom={hero.heroZoom}
        defaultFitToFrame={hero.heroFitToFrame}
        label="Banner image"
        hint="Wide banner across the top of the homepage (~1600×600). Drag to reposition, zoom to reframe, or tick “fit to frame.” Leave empty for a branded gradient."
      />
      <div>
        <label className="label" htmlFor="hero-headline">Headline</label>
        <input id="hero-headline" name="heroHeadline" maxLength={120} defaultValue={hero.heroHeadline ?? ""} className="input" placeholder="Discover events near you" />
      </div>
      <div>
        <label className="label" htmlFor="hero-subhead">Subheading</label>
        <input id="hero-subhead" name="heroSubhead" maxLength={280} defaultValue={hero.heroSubhead ?? ""} className="input" placeholder="Workshops, markets, classes, and more…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="hero-cta-text">Button text</label>
          <input id="hero-cta-text" name="heroCtaText" maxLength={40} defaultValue={hero.heroCtaText ?? ""} className="input" placeholder="Browse events" />
        </div>
        <div>
          <label className="label" htmlFor="hero-cta-href">Button link</label>
          <input id="hero-cta-href" name="heroCtaHref" maxLength={300} defaultValue={hero.heroCtaHref ?? ""} className="input" placeholder="#events  or  /signup  or  https://…" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Any field left blank uses the built-in default. Use <code className="font-mono">#events</code> to scroll to the event grid.
      </p>
      <div className="flex justify-end">
        <SubmitButton className="btn-primary" pendingText="Saving…">Save banner</SubmitButton>
      </div>
    </form>
  );
}
