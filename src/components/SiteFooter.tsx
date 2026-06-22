import Link from "next/link";

/**
 * Shared site footer (columned, Eventbrite-style). Rendered on the homepage and
 * on every marketing page via src/app/(marketing)/layout.tsx. To add a link,
 * edit COLUMNS — every host page picks it up automatically.
 */
const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Help", href: "/help" },
      { label: "Contact support", href: "/contact" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t-2 border-brand-600 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="text-2xl font-bold text-brand-700">
              Your Events App
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Registration, ticketing, and check-in for organizations of every size.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {col.heading}
                </h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-slate-600 hover:text-brand-700">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {year} YourEvents</span>
          <span>
            <a href="mailto:events@yourevents.app" className="hover:text-slate-700">
              events@yourevents.app
            </a>
            {" · "}
            <a href="https://www.yourevents.app" className="hover:text-slate-700">
              yourevents.app
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
