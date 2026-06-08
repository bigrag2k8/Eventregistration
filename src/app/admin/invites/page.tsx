import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { revokeInviteAction, resendInviteAction } from "./actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REVOKED:  "bg-slate-100 text-slate-600",
  EXPIRED:  "bg-red-100 text-red-700",
};

export default async function InvitesPage({ searchParams }: { searchParams: { created?: string } }) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const invites = await prisma.pendingInvite.findMany({
    include: { organization: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Auto-mark expired
  const now = new Date();

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-sm opacity-80 hover:opacity-100">◀ Admin overview</Link>
          <span className="font-semibold">Invites</span>
          <Link href="/admin/orgs/new" className="rounded-lg bg-white px-3 py-1 text-sm text-slate-900 hover:bg-slate-100">+ New invite</Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        {searchParams.created && (
          <div className="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Organization <strong>{searchParams.created}</strong> created and invite email sent.
          </div>
        )}

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invites.map((i) => {
                const effectiveStatus = i.status === "PENDING" && i.expiresAt < now ? "EXPIRED" : i.status;
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-medium">{i.organization.name}</td>
                    <td className="px-4 py-3 text-slate-600">{i.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[effectiveStatus]}`}>{effectiveStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{i.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-500">{i.expiresAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {effectiveStatus === "PENDING" && (
                        <div className="flex items-center justify-end gap-2">
                          <form action={resendInviteAction} className="inline">
                            <input type="hidden" name="inviteId" value={i.id} />
                            <button type="submit" className="text-xs text-brand-700 hover:underline">Resend</button>
                          </form>
                          <form action={revokeInviteAction} className="inline">
                            <input type="hidden" name="inviteId" value={i.id} />
                            <ConfirmButton
                              label="Revoke"
                              confirmText={`Revoke invite to ${i.email}? They won't be able to accept anymore.`}
                              className="text-xs text-red-600 hover:underline"
                            />
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No invites yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
