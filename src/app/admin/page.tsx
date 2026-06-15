import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { FactoryResetCard } from "@/components/FactoryResetCard";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const [orgCount, eventCount, regCount, pendingInvites, recentOrgs, me] = await Promise.all([
    prisma.organization.count({ where: { deletedAt: null } }),
    prisma.event.count({ where: { deletedAt: null } }),
    prisma.registration.count({ where: { status: "CONFIRMED" } }),
    prisma.pendingInvite.count({ where: { status: "PENDING" } }),
    prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { events: true, members: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.sub },
      include: { organization: { select: { name: true } } },
    }),
  ]);

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin">Overview</Link>
            <Link href="/admin/financials" className="opacity-80 hover:opacity-100">Financials</Link>
            <Link href="/admin/superadmins" className="opacity-80 hover:opacity-100">Admins</Link>
            <Link href="/admin/orgs/new" className="rounded-lg bg-white px-3 py-1 text-slate-900 hover:bg-slate-100">+ Invite organization</Link>
            <Link href="/admin/audit" className="opacity-80 hover:opacity-100">Audit log</Link>
            <Link href="/dashboard" className="opacity-80 hover:opacity-100">Back to my dashboard</Link>
            <SignOutButton className="text-sm opacity-80 hover:text-red-300" />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Platform overview</h1>
        <p className="text-sm text-slate-500">Across all organizations</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Organizations" value={String(orgCount)} />
          <Stat label="Events" value={String(eventCount)} />
          <Stat label="Confirmed registrations" value={String(regCount)} />
          <Stat label="Pending invites" value={String(pendingInvites)} />
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent organizations</h2>
          <Link href="/admin/orgs/new" className="btn-primary">+ Invite organization</Link>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.slug}</td>
                  <td className="px-4 py-3 text-right">{o._count.members}</td>
                  <td className="px-4 py-3 text-right">{o._count.events}</td>
                  <td className="px-4 py-3 text-slate-500">{o.createdAt.toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/orgs/${o.id}`} className="font-medium text-brand-700 hover:underline">Manage</Link>
                      <Link href={`/o/${o.slug}`} target="_blank" className="text-slate-500 hover:underline">View public ↗</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {recentOrgs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No organizations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pendingInvites > 0 && (
          <div className="mt-6">
            <Link href="/admin/invites" className="text-sm text-brand-700 hover:underline">
              View {pendingInvites} pending invite{pendingInvites > 1 ? "s" : ""} →
            </Link>
          </div>
        )}

        <FactoryResetCard
          keepEmail={me?.email ?? "your account"}
          keepOrgName={me?.organization?.name ?? null}
        />
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
