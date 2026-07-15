import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
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
  // Mirrors the createRecurringEventAction gate: a credit is needed to sell a bundle,
  // or once the single free-recurring-event slot is already taken.
  const freeSlotOpen = activeFreeRecurring === 0;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">New recurring event</span>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {searchParams?.bought === "RECURRING_EVENT_CREDIT" && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Recurring event credit added — you now have <strong>{credits}</strong> credit{credits === 1 ? "" : "s"}.
            Finish setting up your recurring event below (you can include the all-sessions pass).
          </div>
        )}
        <p className="mb-4 text-sm text-slate-600">
          A recurring event runs on a schedule and creates a real, independently-registerable session for each date —
          so a weekly class always shows its next few months. You can cancel or reschedule any single session later.
        </p>

        {/* Credits status + in-context purchase */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Recurring event credits: {credits}</span>
            <span className="ml-2 text-slate-500">
              {freeSlotOpen
                ? "Your free recurring-event slot is open — drop-in only, 50 registrations per session. A credit unlocks the all-sessions pass, unlimited registrations, and your branding."
                : "Your free recurring-event slot is in use — creating another one needs a credit ($34.99)."}
            </span>
          </div>
          <form action="/api/billing/checkout" method="POST">
            <input type="hidden" name="planKey" value="RECURRING_EVENT_CREDIT" />
            <input type="hidden" name="returnTo" value="/dashboard/recurring/new" />
            <button type="submit" className="btn-secondary whitespace-nowrap">Buy recurring event credit — $34.99</button>
          </form>
        </div>

        <RecurringEventForm />
      </div>
    </main>
  );
}
