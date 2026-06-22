import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountNav } from "@/components/AccountNav";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/account/signin");
  // Staff have their own dashboard; /account is the attendee surface.
  if (session.role !== "ATTENDEE") redirect("/dashboard");

  // Prefer the profile name; fall back to the name on the most recent
  // registration (attendee accounts created via magic link start with no name).
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { firstName: true, lastName: true },
  });
  let fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  if (!fullName) {
    const reg = await prisma.registration.findFirst({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      select: { firstName: true, lastName: true },
    });
    if (reg) fullName = [reg.firstName, reg.lastName].filter(Boolean).join(" ");
  }

  return (
    <div>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="YourEvents home" title="Back to yourevents.app home">
            <Logo height={32} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              {fullName && <div className="text-sm font-medium text-slate-900">{fullName}</div>}
              <div className="text-xs text-slate-500">{session.email}</div>
            </div>
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
