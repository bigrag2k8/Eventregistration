import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { ConnectRequiredBanner } from "@/components/ConnectRequiredBanner";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN", "SUPERADMIN"];

/**
 * Persistent dashboard chrome: the top nav is rendered here so it stays on every
 * dashboard page (previously it lived only on the dashboard home, so navigating
 * into a section dropped the menu). Individual pages keep their own contextual
 * sub-header (breadcrumb + page actions); sign-out lives only here now.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");
  // Attendees have their own area at /account — keep them out of the org dashboard.
  if (!STAFF_ROLES.includes(session.role)) redirect("/account");

  const role = session.role;
  const isField = role === "STAFF" || role === "VOLUNTEER";

  return (
    <div>
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" title="Back to yourevents.app home" aria-label="Your Events home">
            <Logo height={40} />
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            <Link href="/dashboard" className="hover:text-brand-700">Dashboard</Link>
            {!isField && <Link href="/dashboard/financials" className="hover:text-brand-700">Financials</Link>}
            {!isField && <Link href="/dashboard/reviews" className="hover:text-brand-700">Reviews</Link>}
            {!isField && <Link href="/dashboard/marketing" className="hover:text-brand-700">Marketing</Link>}
            {!isField && <Link href="/dashboard/refer" className="hover:text-brand-700">Refer</Link>}
            {!isField && <Link href="/dashboard/billing" className="hover:text-brand-700">Billing</Link>}
            {!isField && <Link href="/dashboard/audit" className="hover:text-brand-700">Audit log</Link>}
            {!isField && <Link href="/dashboard/settings" className="hover:text-brand-700">Settings</Link>}
            {isField && <Link href="/checkin" className="hover:text-brand-700">Scanner</Link>}
            {role === "SUPERADMIN" && (
              <Link href="/admin" className="rounded-lg bg-slate-900 px-3 py-1 text-white hover:bg-slate-800">
                🛡 Platform Admin
              </Link>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{role}</span>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <ConnectRequiredBanner session={session} />
      {children}
    </div>
  );
}
