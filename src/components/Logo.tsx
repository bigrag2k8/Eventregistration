import Image from "next/image";

/**
 * Compact YourEvents wordmark — the icon + "YourEvents" lettering, no tagline.
 * Renders /public/logo-mark.png. Use this in every nav/header where the
 * tagline would be too small to read (anything under ~80px tall).
 */
interface LogoProps {
  /** Rendered height in pixels. Default 32 fits a primary nav comfortably. */
  height?: number;
  className?: string;
  alt?: string;
}

export function Logo({ height = 32, className = "", alt = "YourEvents" }: LogoProps) {
  return (
    <Image
      // NOTE: a dedicated compact mark (/logo-mark.png — icon + wordmark, no
      // tagline) doesn't exist yet, so this falls back to the full lockup. Drop
      // a real /logo-mark.png in /public and switch this back for a small nav.
      src="/logo.png"
      alt={alt}
      width={480}
      height={96}
      priority
      style={{ height: `${height}px`, width: "auto" }}
      className={className}
    />
  );
}

/**
 * Full YourEvents lockup — icon, wordmark, AND the "Tickets, Vendors, Check-in.
 * Done." tagline. Renders /public/logo.png. Reserve this for spots with real
 * vertical room: the homepage hero, the maintenance page, and email headers.
 * In a 48px-tall nav the tagline becomes unreadable; use <Logo/> there.
 */
interface LogoFullProps {
  /** Rendered height in pixels. Default 120 looks balanced on a homepage hero on desktop. */
  height?: number;
  className?: string;
  alt?: string;
}

export function LogoFull({
  height = 120,
  className = "",
  alt = "YourEvents — Tickets, Vendors, Check-in. Done.",
}: LogoFullProps) {
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
