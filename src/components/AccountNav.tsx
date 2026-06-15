"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account", label: "My Events" },
  { href: "/account/waitlist", label: "Waitlist" },
  { href: "/account/refund-requests", label: "Refund Requests" },
  { href: "/account/profile", label: "Profile" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {ITEMS.map((item) => {
        const active =
          item.href === "/account"
            ? pathname === "/account"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
