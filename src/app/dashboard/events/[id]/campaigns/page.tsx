import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { PLANS } from "@/lib/plans";
import { SignOutButton } from "@/components/SignOutButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { sendCampaignAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
    include: { organization: { select: { name: true, subscriptionPlan: true } } },
  });
  if (!event) return notFound();

  const plan = PLANS[event.organization.subscriptionPlan as keyof typeof PLANS] ?? PLANS.FREE;
  const limit = plan.emailCampaignsPerEvent;

  const [campaigns, sentCount, confirmedCount] = await Promise.all([
    prisma.emailCampaign.findMany({
      where: { eventId: event.id }, orderBy: { createdAt: "desc" }, take: 50,
      include: { _count: { select: { emailLogs: true } } },
    }),
    prisma.emailCampaign.count({ where: { eventId: event.id, sentAt: { not: null } } }),
    prisma.registration.count({ where: { eventId: event.id, status: "CONFIRMED" } }),
  ]);

  const remaining = limit === null ? null : Math.max(0, limit - sentCount);
  const atLimit = remaining !== null && remaining === 0;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">◀ Event</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Communications</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {/* Plan / usage banner */}
        <div className={`card flex flex-wrap items-center justify-between gap-3 ${atLimit ? "ring-2 ring-amber-300 bg-amber-50" : ""}`}>
          <div>
            <h2 className="text-lg font-semibold">Email broadcasts</h2>
            <p className="text-sm text-slate-600">
              Plan: <strong>{plan.name}</strong>
              {limit === null
                ? " · Unlimited broadcasts per event"
                : ` · ${sentCount} of ${limit} broadcast${limit > 1 ? "s" : ""} sent`}
              {" · "}{confirmedCount} confirmed registrants
            </p>
            {atLimit && (
              <p className="mt-1 text-sm text-amber-800">
                You've reached your plan's communication limit for this event.{" "}
                <Link href="/dashboard/billing" className="font-semibold underline">Upgrade your plan</Link>{" "}
                to send more.
              </p>
            )}
          </div>
          {remaining !== null && !atLimit && (
            <div className="rounded-lg bg-brand-50 px-4 py-2 text-center">
              <div className="text-xs uppercase tracking-wider text-brand-700">Remaining</div>
              <div className="text-2xl font-bold text-brand-700">{remaining}</div>
            </div>
          )}
        </div>

        {/* Compose */}
        {!atLimit && (
          <form action={sendCampaignAction} className="card space-y-3">
            <h2 className="text-lg font-semibold">Send a new broadcast</h2>
            <p className="text-sm text-slate-500">
              Sends to all <strong>{confirmedCount}</strong> confirmed registrant{confirmedCount === 1 ? "" : "s"}.
              You can use plain text or HTML. The event header and a "View event" button are added automatically.
            </p>
            <input type="hidden" name="eventId" value={event.id} />
            <div>
              <label className="label">Subject *</label>
              <input name="subject" required maxLength={200} className="input"
                     placeholder="Last-minute reminder: parking instructions" />
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea name="body" required rows={10} maxLength={20000} className="input"
                        placeholder={`Hi everyone,\n\nLooking forward to seeing you on Saturday! A few last-minute notes:\n\n- Doors open at 8:30am\n- Use the back parking lot\n- Bring a sweater, the AC is cold\n\nSee you soon!\n— The team`} />
              <p className="mt-1 text-xs text-slate-500">
                Plain newlines are converted to line breaks automatically. HTML is also accepted.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button type="submit" className="btn-primary"
                      disabled={confirmedCount === 0}
                      title={confirmedCount === 0 ? "No confirmed registrants to send to yet." : undefined}>
                Send to {confirmedCount} {confirmedCount === 1 ? "person" : "people"}
              </button>
            </div>
          </form>
        )}

        {/* Past sends */}
        <section>
          <h2 className="text-lg font-semibold">Sent broadcasts</h2>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3 text-right">Recipients</th>
                  <th className="px-4 py-3 text-right">Total logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.filter((c) => c.sentAt).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-slate-500">{c.sentAt!.toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{c.subject}</td>
                    <td className="px-4 py-3 text-right">{c.recipientsCount}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{c._count.emailLogs}</td>
                  </tr>
                ))}
                {campaigns.filter((c) => c.sentAt).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    No broadcasts sent yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
