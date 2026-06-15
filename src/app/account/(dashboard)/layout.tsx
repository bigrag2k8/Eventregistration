import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountNav } from "@/components/AccountNav";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/account/signin");
  // Staff have their own dashboard; /account is the attendee surface.
  if (session.role !== "ATTENDEE") redirect("/dashboard");

  return (
    <div>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/account" className="font-bold text-brand-700">Your Events</Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{session.email}</span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-3">
          <AccountNav />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
