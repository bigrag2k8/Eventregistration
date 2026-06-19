import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isProtectedOwner, ownerEmails } from "@/lib/owner";
import { SignOutButton } from "@/components/SignOutButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { grantSuperadminAction, revokeSuperadminAction, inviteAdminAction, revokeAdminInviteAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  no_email: "Enter an email address.",
  not_found: "No account found for that email. They must sign up or be invited first.",
  already: "That user is already a SUPERADMIN.",
  owner_protected: "The protected owner account cannot be demoted.",
  cant_self: "You can't remove your own SUPERADMIN access — ask another admin.",
  last_one: "You can't remove the last SUPERADMIN.",
  invite_existing_user: "That email already has an account — use “Grant SUPERADMIN” above instead of inviting.",
  owner_only: "Only the platform owner can invite or revoke platform admins.",
};

interface Props {
  searchParams: { error?: string; granted?: string; revoked?: string; invited?: string; invite_revoked?: string };
}

export default async function SuperadminsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const [admins, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPERADMIN", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true, createdAt: true },
    }),
    prisma.adminInvite.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true, expiresAt: true },
    }),
  ]);

  const ownerConfigured = ownerEmails().length > 0;
  const isOwner = isProtectedOwner(session.email);
  const err = searchParams.error ? ERRORS[searchParams.error] ?? "Something went wrong." : null;

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="text-slate-500">/</span>
            <span>SUPERADMINs</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="opacity-80 hover:opacity-100">Overview</Link>
            <SignOutButton className="text-sm opacity-80 hover:text-red-300" />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Platform administrators</h1>
          <p className="text-sm text-slate-500">Grant or revoke SUPERADMIN access. Every change is written to the audit log.</p>
        </div>

        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{err}</div>}
        {searchParams.granted && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">SUPERADMIN access granted.</div>}
        {searchParams.revoked && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">SUPERADMIN access revoked.</div>}
        {searchParams.invited && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">Admin invite sent. The platform owner has been notified.</div>}
        {searchParams.invite_revoked && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">Admin invite revoked.</div>}

        {/* Owner / break-glass status */}
        <div className={`rounded-lg p-4 text-sm ring-1 ${ownerConfigured ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
          <strong>Protected owner (break-glass):</strong>{" "}
          {ownerConfigured
            ? <>configured via the <code>OWNER_EMAIL</code> environment variable. That account is always SUPERADMIN, cannot be demoted here, and self-heals on sign-in — so you can never be locked out.</>
            : <>not configured. Set the <code>OWNER_EMAIL</code> environment variable on Railway (your email) to guarantee you can never lose admin access.</>}
        </div>

        {/* Grant form */}
        <form action={grantSuperadminAction} className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Grant SUPERADMIN to</label>
            <input name="email" type="email" required placeholder="person@example.com" className="input" />
            <p className="mt-1 text-xs text-slate-400">They must already have an account (signup, invite, or attendee sign-in).</p>
          </div>
          <button type="submit" className="btn-primary">Grant access</button>
        </form>

        {/* Owner-only: minting brand-new platform admins is restricted to OWNER_EMAIL. */}
        {isOwner && (
        <>
        {/* Invite a brand-new admin by email */}
        <form action={inviteAdminAction} className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Invite a new admin (no account yet)</label>
            <input name="email" type="email" required placeholder="newadmin@example.com" className="input" />
            <p className="mt-1 text-xs text-slate-400">
              They get an email, set a strict password, and become a SUPERADMIN. The platform owner is
              emailed whenever an admin is invited. Invited admins <strong>cannot</strong> run the factory reset.
            </p>
          </div>
          <button type="submit" className="btn-primary">Send invite</button>
        </form>

        {/* Pending admin invites */}
        {pendingInvites.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending admin invites
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Sent</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 font-medium">{inv.email}</td>
                    <td className="px-4 py-2 text-slate-500">{inv.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-slate-500">{inv.expiresAt.toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeAdminInviteAction} className="inline">
                        <input type="hidden" name="inviteId" value={inv.id} />
                        <button type="submit" className="text-xs text-red-600 hover:underline">Revoke</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}

        {/* List */}
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Last login</th>
                <th className="px-4 py-2">Since</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => {
                const owner = isProtectedOwner(a.email);
                const isSelf = a.id === session.sub;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">
                      {a.email}
                      {owner && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">OWNER</span>}
                      {isSelf && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">you</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{a.lastLoginAt ? a.lastLoginAt.toLocaleDateString() : "never"}</td>
                    <td className="px-4 py-2 text-slate-500">{a.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right">
                      {owner ? (
                        <span className="text-xs text-slate-400">Protected</span>
                      ) : isSelf ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <form action={revokeSuperadminAction} className="inline">
                          <input type="hidden" name="userId" value={a.id} />
                          <ConfirmButton
                            label="Revoke"
                            confirmText={`Revoke SUPERADMIN access from ${a.email}? They will be demoted to a normal account.`}
                            className="text-xs text-red-600 hover:underline"
                          />
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
