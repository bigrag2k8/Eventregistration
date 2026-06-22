import Image from "next/image";

/**
 * The YourEvents wordmark + ticket icon used in every header and nav across
 * the app. Renders /public/logo-mark.png at a fixed height so the proportions
 * stay consistent — height is the dial, width tracks the natural aspect ratio.
 *
 * For the homepage hero (or any place that benefits from the full logo + the
 * tagline), use <LogoFull/> below, which points at /public/logo.png.
 */
interface LogoProps {
  /** Rendered height in pixels. Default 32 fits comfortably in a 48–56px-tall sticky nav. */
  height?: number;
  className?: string;
  /** When true, links to home; default is false because the parent usually wraps the logo in its own Link. */
  asLink?: boolean;
  /** Override the alt text when used in a non-nav context (e.g. screen-reader contexts). */
  alt?: string;
}

export function Logo({ height = 32, className = "", alt = "YourEvents" }: LogoProps) {
  // Source intrinsic dimensions are loaded by next/image at build time, so we
  // just pick a wide enough source-width number for the calculator. The
  // rendered size is controlled by the `height` style below.
  return (
    <Image
      src="/logo-mark.png"
      alt={alt}
      width={480}
      height={96}
      priority
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
    />
  );
}

interface LogoFullProps {
  /** Rendered height in pixels. Default 120 looks balanced on a homepage hero on desktop. */
  height?: number;
  className?: string;
  alt?: string;
}

/**
 * Full YourEvents lockup — icon, wordmark, AND the "Tickets, Vendors, Check-in. Done."
 * tagline. Use this on the marketing homepage hero, the splash on signin, the
 * email header (where we have room), and the maintenance page. For anywhere
 * the available height is under ~80px, prefer <Logo/> — the tagline becomes
 * unreadable at small sizes.
 */
export function LogoFull({ height = 120, className = "", alt = "YourEvents — Tickets, Vendors, Check-in. Done." }: LogoFullProps) {
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
