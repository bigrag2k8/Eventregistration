import Link from "next/link";
import { PublicAccountNav } from "@/components/PublicAccountNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Logo } from "@/components/Logo";

// PublicAccountNav reads the session cookie, so these pages render per-request.
export const dynamic = "force-dynamic";

/**
 * Shared chrome for the public marketing/info pages (how-it-works, pricing,
 * about, help, status, contact, terms, privacy): the same sticky header as the
 * homepage plus the shared SiteFooter, with the page body in between.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="YourEvents home">
            <Logo height={40} />
          </Link>
          <nav>
            <PublicAccountNav />
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <SiteFooter />
    </div>
  );
}
