import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function PlatformAuditLogPage({ searchParams }: {
  searchParams: { q?: string; action?: string; orgId?: string; page?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  const page = Math.max(1, parseInt(searchParams.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = {};
  if (searchParams.orgId) where.organizationId = searchParams.orgId;
  if (searchParams.action) where.action = { contains: searchParams.action, mode: "insensitive" };
  if (searchParams.q) {
    where.OR = [
      { action: { contains: searchParams.q, mode: "insensitive" } },
      { targetType: { contains: searchParams.q, mode: "insensitive" } },
      { targetId: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  const [logs, total, orgs] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        organization: { select: { name: true, slug: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.organization.findMany({
      where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold">Platform Admin</Link>
            <span className="text-slate-500">/</span>
            <span className="font-semibold">Audit log</span>
            <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs">SUPERADMIN</span>
          </div>
          <SignOutButton className="text-sm opacity-80 hover:text-red-300" />
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Platform-wide audit log</h1>
          <p className="text-sm text-slate-500">
            Every action across every organization. Newest first.
          </p>
        </div>

        <form className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Search</label>
            <input name="q" defaultValue={searchParams.q ?? ""} className="input" placeholder="Action, target type, target ID…" />
          </div>
          <div>
            <label className="label">Organization</label>
            <select name="orgId" defaultValue={searchParams.orgId ?? ""} className="input">
              <option value="">All organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Action contains</label>
            <input name="action" defaultValue={searchParams.action ?? ""} className="input" placeholder="event., vendor., team." />
          </div>
          <button type="submit" className="btn-secondary">Filter</button>
          <Link href="/admin/audit?action=auth." className="btn-secondary">Auth events</Link>
          {(searchParams.q || searchParams.action || searchParams.orgId) && (
            <Link href="/admin/audit" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
          )}
        </form>

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const who = log.user
                  ? `${log.user.firstName ?? ""} ${log.user.lastName ?? ""}`.trim() || log.user.email
                  : "system";
                return (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap" title={log.createdAt.toISOString()}>
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{log.organization?.name ?? "—"}</td>
                    <td className="px-4 py-3">{who}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ipAddress ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${log.action.startsWith("auth.") ? "bg-blue-100 text-blue-700" : "bg-slate-100"}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.targetType ? (
                        <>
                          <div className="text-xs uppercase tracking-wider text-slate-400">{log.targetType}</div>
                          <div className="font-mono text-xs">{log.targetId ?? "—"}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <pre className="whitespace-pre-wrap break-words max-w-md font-mono">
                        {log.metadata ? JSON.stringify(log.metadata, null, 0) : "—"}
                      </pre>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No audit log entries match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} of {totalPages} · {total} entries</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={{ pathname: "/admin/audit", query: { ...searchParams, page: page - 1 } }} className="btn-secondary">← Previous</Link>
              )}
              {page < totalPages && (
                <Link href={{ pathname: "/admin/audit", query: { ...searchParams, page: page + 1 } }} className="btn-secondary">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
