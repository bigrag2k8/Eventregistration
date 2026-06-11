import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const ACTION_COLOR: Record<string, string> = {
  publish: "bg-emerald-100 text-emerald-700",
  unpublish: "bg-amber-100 text-amber-700",
  delete: "bg-red-100 text-red-700",
  cancel: "bg-amber-100 text-amber-700",
  approve: "bg-emerald-100 text-emerald-700",
  reject: "bg-red-100 text-red-700",
  invite: "bg-brand-100 text-brand-700",
  remove: "bg-slate-200 text-slate-700",
};

function actionPillClass(action: string) {
  const verb = action.split(".").pop() ?? "";
  return ACTION_COLOR[verb] ?? "bg-slate-100 text-slate-600";
}

interface SearchParams {
  q?: string;
  action?: string;
  page?: string;
}

const PAGE_SIZE = 50;

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  // SUPERADMIN can audit any org; everyone else must have one linked.
  if (!session.orgId && session.role !== "SUPERADMIN") redirect("/dashboard");
  if (session.role !== "SUPERADMIN") await requirePlanSelected(session);

  const page = Math.max(1, parseInt(searchParams.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = { ...orgScope(session) };
  if (searchParams.action) where.action = { contains: searchParams.action, mode: "insensitive" };
  if (searchParams.q) {
    where.OR = [
      { action: { contains: searchParams.q, mode: "insensitive" } },
      { targetType: { contains: searchParams.q, mode: "insensitive" } },
      { targetId: { contains: searchParams.q, mode: "insensitive" } },
    ];
  }

  const [logs, total, distinctActions] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take: PAGE_SIZE,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where: { ...orgScope(session) }, select: { action: true }, distinct: ["action"],
      orderBy: { action: "asc" }, take: 50,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Audit log</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-slate-500">
            Every event publish, cancellation, vendor decision, and team change in your organization. Read-only.
          </p>
        </div>

        <form className="card flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="label">Search</label>
            <input name="q" defaultValue={searchParams.q ?? ""} className="input" placeholder="Action, target type, target ID…" />
          </div>
          <div>
            <label className="label">Action</label>
            <select name="action" defaultValue={searchParams.action ?? ""} className="input">
              <option value="">All actions</option>
              {distinctActions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-secondary">Filter</button>
          {(searchParams.q || searchParams.action) && (
            <Link href="/dashboard/audit" className="text-sm text-slate-500 hover:text-slate-900">Clear</Link>
          )}
        </form>

        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
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
                    <td className="px-4 py-3">{who}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${actionPillClass(log.action)}`}>
                        {log.action}
                      </span>
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
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No audit log entries yet. Actions you take in the dashboard will appear here.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} of {totalPages} · {total} entries</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={{ pathname: "/dashboard/audit", query: { ...searchParams, page: page - 1 } }} className="btn-secondary">← Previous</Link>
              )}
              {page < totalPages && (
                <Link href={{ pathname: "/dashboard/audit", query: { ...searchParams, page: page + 1 } }} className="btn-secondary">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
