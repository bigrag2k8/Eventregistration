import Image from "next/image";

/**
 * The YourEvents lockup — icon, wordmark, and the "Tickets, Vendors, Check-in.
 * Done." tagline — used in every header and nav across the app. Renders
 * /public/logo.png at a fixed height; width tracks the natural aspect ratio.
 *
 * Pick a height that gives the tagline room to read: 56px or taller for hero
 * areas, 48px for primary navs, 40px for sub-page breadcrumb headers. Below
 * ~40px the tagline starts to compress; that's the floor.
 */
interface LogoProps {
  /** Rendered height in pixels. Default 48 fits a primary nav comfortably. */
  height?: number;
  className?: string;
  /** Override the alt text when used in a non-nav context (e.g. screen-reader contexts). */
  alt?: string;
}

export function Logo({ height = 48, className = "", alt = "YourEvents — Tickets, Vendors, Check-in. Done." }: LogoProps) {
  // Width number is just for next/image's aspect-ratio calculator; the actual
  // rendered size is controlled by the style attribute below.
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={600}
      height={400}
      priority
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
    />
  );
}
