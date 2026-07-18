import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FREE_RECURRING_EVENTS } from "@/lib/plans";
import { RecurringEventForm } from "@/components/RecurringEventForm";

export const dynamic = "force-dynamic";

export default async function NewRecurringEventPage({ searchParams }: { searchParams: { error?: string; bought?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { recurringEventCredits: true },
  });
  const activeFreeRecurring = await prisma.recurringEvent.count({
    where: { organizationId: session.orgId, status: "ACTIVE", isPremium: false, deletedAt: null },
  });
  const credits = org?.recurringEventCredits ?? 0;
  // Mirrors the createRecurringEventAction gate: a credit is needed to sell a
  // bundle, or once both free-recurring-event slots are already taken.
  const freeSlotOpen = activeFreeRecurring < FREE_RECURRING_EVENTS;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New recurring event</h1>
        <p className="mt-1 text-sm text-slate-500">
          Runs on a schedule and creates a real, independently-registerable session for each date — cancel or reschedule
          any single session later.
        </p>
      </div>

      <ErrorBanner code={searchParams?.error} />
      {searchParams?.bought === "RECURRING_EVENT_CREDIT" && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          ✓ Recurring event credit added — you now have <strong>{credits}</strong> credit{credits === 1 ? "" : "s"}.
          Set an all-sessions pass price below to use one.
        </div>
      )}

      {/* Free vs. paid comparison */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Free</h3>
            {freeSlotOpen ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Available</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Both used</span>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>✓ Up to 12 sessions on a schedule</li>
            <li>✓ Drop-in tickets, 50 registrations / session</li>
            <li>✓ 1 email blast per session</li>
            <li className="text-slate-400">✗ No all-sessions pass</li>
            <li className="text-slate-400">✗ No custom branding</li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">2 free recurring events per organization.</p>
        </div>

        <div className="rounded-xl border-2 border-brand-300 bg-brand-50/50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-brand-800">With a $19 credit</h3>
            <span className="text-xs text-slate-500">You have {credits}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>✓ Everything in Free, plus:</li>
            <li>✓ <strong>All-sessions pass</strong> — one checkout buys every session</li>
            <li>✓ <strong>Unlimited</strong> registrations per session</li>
            <li>✓ Your logo &amp; brand color on the event</li>
            <li>✓ 5 email blasts per session</li>
          </ul>
          {credits > 0 ? (
            <p className="mt-3 text-xs font-medium text-emerald-700">
              You have {credits} credit{credits === 1 ? "" : "s"} ready — add an all-sessions pass below to use one.
            </p>
          ) : (
            <form action="/api/billing/checkout" method="POST" className="mt-3">
              <input type="hidden" name="planKey" value="RECURRING_EVENT_CREDIT" />
              <input type="hidden" name="returnTo" value="/dashboard/recurring/new" />
              <button type="submit" className="btn-primary w-full">Buy a credit — $19</button>
            </form>
          )}
        </div>
      </div>

      <RecurringEventForm canOfferPass={credits > 0} />
    </main>
  );
}
