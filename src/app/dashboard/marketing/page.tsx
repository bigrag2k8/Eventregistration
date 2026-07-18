import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage, orgScope } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SubmitButton } from "@/components/SubmitButton";
import { sendMarketingCampaignAction, marketingAudience } from "./actions";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string };
}) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);
  const orgId = session.orgId;

  const now = new Date();
  const [audience, unsubCount, upcoming, history] = await Promise.all([
    marketingAudience(orgId),
    prisma.marketingUnsubscribe.count({ where: { organizationId: orgId } }),
    prisma.event.findMany({
      where: { ...orgScope(session), deletedAt: null, status: "PUBLISHED", endAt: { gte: now }, recurringEventId: null },
      orderBy: { startAt: "asc" },
      select: { id: true, name: true, startAt: true },
      take: 25,
    }),
    prisma.marketingCampaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const lastSend = history.find((h) => h.sentAt);
  const onCooldown = !!lastSend?.sentAt && Date.now() - lastSend.sentAt.getTime() < 24 * 60 * 60 * 1000;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Email your attendees</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reach everyone who&rsquo;s registered for your events — perfect for announcing your next one. One send per day.
        </p>
      </div>

      <ErrorBanner code={searchParams?.error} />
      {searchParams?.sent !== undefined && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          ✓ Sent to <strong>{searchParams.sent}</strong> {Number(searchParams.sent) === 1 ? "person" : "people"}.
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Audience" value={String(audience.length)} hint="unique attendees" />
        <Stat label="Unsubscribed" value={String(unsubCount)} hint="opted out" />
        <Stat label="Upcoming events" value={String(upcoming.length)} hint="to promote" />
      </div>

      {audience.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No audience yet — once people register for your events, you can email them here.
        </div>
      ) : (
        <form action={sendMarketingCampaignAction} className="space-y-5 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          {onCooldown && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              You already sent a blast in the last 24 hours. You can send another one tomorrow.
            </div>
          )}
          <div>
            <label className="label" htmlFor="m-promote">Promote an upcoming event (optional)</label>
            <select id="m-promote" name="promotedEventId" className="input">
              <option value="">— No specific event —</option>
              {upcoming.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.startAt.toLocaleDateString()}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Adds a &ldquo;View event&rdquo; button linking to it.</p>
          </div>

          <div>
            <label className="label" htmlFor="m-subject">Subject *</label>
            <input id="m-subject" name="subject" required minLength={2} maxLength={200} className="input" placeholder="We're back — join us next month!" />
          </div>

          <div>
            <label className="label" htmlFor="m-body">Message *</label>
            <textarea id="m-body" name="body" required minLength={10} maxLength={20000} rows={8} className="input" placeholder="Write your announcement… plain text or HTML both work." />
            <p className="mt-1 text-xs text-slate-400">
              Every email includes an unsubscribe link automatically — required by law and good for your sender reputation.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Sends to {audience.length} {audience.length === 1 ? "person" : "people"}.</span>
            <SubmitButton className="btn-primary" pendingText="Sending…">Send to {audience.length}</SubmitButton>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Recent sends</h2>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3 text-right">Recipients</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-medium">{h.subject}</td>
                    <td className="px-4 py-3 text-slate-600">{h.sentAt ? h.sentAt.toLocaleString() : "draft"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{h.recipientsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        <Link href="/dashboard" className="text-brand-700 hover:underline">◀ Back to dashboard</Link>
      </p>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </div>
  );
}
