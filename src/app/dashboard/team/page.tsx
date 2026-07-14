import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage } from "@/lib/auth";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { requirePlanSelected } from "@/lib/plan-gate";
import { resendTeamInviteAction, revokeTeamInviteAction, removeMemberAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_STYLES: Record<string, string> = {
  ORGANIZER: "bg-brand-100 text-brand-700",
  STAFF:     "bg-emerald-100 text-emerald-700",
  VOLUNTEER: "bg-amber-100 text-amber-700",
  ADMIN:     "bg-purple-100 text-purple-700",
  SUPERADMIN: "bg-red-100 text-red-700",
  ATTENDEE:  "bg-slate-100 text-slate-600",
};

const INVITE_STATUS_STYLES: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REVOKED:  "bg-slate-100 text-slate-600",
  EXPIRED:  "bg-red-100 text-red-700",
};

export default async function TeamPage({ searchParams }: { searchParams: { invited?: string; updated?: string; error?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);
  // Only ORGANIZERs see the Edit link per product spec; ADMIN/SUPERADMIN view-only here.
  const canEdit = session.role === "ORGANIZER";

  const [org, members, invites] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.orgId } }),
    prisma.user.findMany({
      where: { organizationId: session.orgId, deletedAt: null },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.pendingInvite.findMany({
      where: { organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!org) redirect("/dashboard");

  const now = new Date();

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{org.name} — Team</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">Dashboard</Link>
            <Link href="/dashboard/team/invite" className="btn-primary">+ Invite team member</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {/* Success acknowledgments (invited / updated) render globally via
            <SavedToast/> in the root layout. */}

        {/* Active members */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Team members</h2>
            <span className="text-sm text-slate-500">{members.length} active</span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium">
                      {[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}
                      {m.id === session.sub && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_STYLES[m.role]}`}>{m.role}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-500">{m.lastLoginAt ? m.lastLoginAt.toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {canEdit && m.role !== "SUPERADMIN" && (
                          <Link
                            href={`/dashboard/team/${m.id}/edit`}
                            className="text-xs font-medium text-brand-700 hover:underline"
                          >
                            Edit
                          </Link>
                        )}
                        {canEdit && m.id !== session.sub && m.role !== "SUPERADMIN" && (
                          <form action={removeMemberAction} className="inline">
                            <input type="hidden" name="userId" value={m.id} />
                            <ConfirmButton
                              label="Remove"
                              confirmText={`Remove ${m.firstName ?? m.email} from ${org.name}? They will lose access immediately.`}
                              className="text-xs text-red-600 hover:underline"
                            />
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No active members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invites */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Invites</h2>
            <span className="text-sm text-slate-500">{invites.length} total</span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Invitee</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((i) => {
                  const effective = i.status === "PENDING" && i.expiresAt < now ? "EXPIRED" : i.status;
                  const personName = [i.invitedFirstName, i.invitedLastName].filter(Boolean).join(" ");
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{personName || "—"}</div>
                        <div className="text-xs text-slate-500">{i.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_STYLES[i.role]}`}>{i.role}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-md">
                        {i.roleDescription
                          ? <span className="line-clamp-2">{i.roleDescription}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${INVITE_STATUS_STYLES[effective]}`}>{effective}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{i.createdAt.toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {effective === "PENDING" && (
                          <div className="flex items-center justify-end gap-2">
                            <form action={resendTeamInviteAction} className="inline">
                              <input type="hidden" name="inviteId" value={i.id} />
                              <button type="submit" className="text-xs text-brand-700 hover:underline">Resend</button>
                            </form>
                            <form action={revokeTeamInviteAction} className="inline">
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
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No invites yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
