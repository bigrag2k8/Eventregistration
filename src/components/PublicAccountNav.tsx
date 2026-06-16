import Link from "next/link";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

const linkCls =
  "inline-flex items-center rounded-lg px-3 py-1.5 font-medium text-brand-700 ring-1 ring-brand-300 hover:bg-brand-50";

function homeFor(role: string): { href: string; label: string } {
  if (role === "ATTENDEE") return { href: "/account", label: "My account" };
  if (role === "STAFF" || role === "VOLUNTEER") return { href: "/checkin", label: "Check-in" };
  return { href: "/dashboard", label: "Dashboard" }; // ORGANIZER, ADMIN, SUPERADMIN
}

/**
 * Auth-aware navigation for PUBLIC pages (homepage, event landing). When the
 * visitor has an active session it shows a link to their area (account /
 * check-in / dashboard, by role) plus sign out; otherwise it shows the
 * sign-in / sign-up links. `compact` trims the logged-out state to a single
 * "Sign in" link for tight headers (the event page).
 *
 * Reads getSession(); host pages must be dynamic (both already are).
 */
export async function PublicAccountNav({ compact = false }: { compact?: boolean }) {
  const session = await getSession();

  if (session) {
    const { href, label } = homeFor(session.role);
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <Link href={href} className={linkCls}>{label}</Link>
        <SignOutButton className="px-2 py-1.5 text-sm text-slate-500 hover:text-red-600" />
      </div>
    );
  }

  if (compact) {
    return <Link href="/account/signin" className={linkCls}>Sign in</Link>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      <Link href="/account/signin" className={linkCls} title="For attendees who registered for an event">
        Attendee sign in
      </Link>
      <Link href="/signin" className={linkCls} title="For event organizers and their staff">
        Organizer &amp; staff
      </Link>
      <Link href="/signup" className="btn-primary">Sign up — host events</Link>
    </div>
  );
}
