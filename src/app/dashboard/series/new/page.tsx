import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SeriesForm } from "@/components/SeriesForm";

export const dynamic = "force-dynamic";

export default async function NewSeriesPage({ searchParams }: { searchParams: { error?: string; bought?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { seriesCredits: true },
  });
  const activeFreeSeries = await prisma.eventSeries.count({
    where: { organizationId: session.orgId, status: "ACTIVE", isPremium: false, deletedAt: null },
  });
  const credits = org?.seriesCredits ?? 0;
  // Mirrors the createSeriesAction gate: a credit is needed to sell a bundle,
  // or once the single free-series slot is already taken.
  const freeSlotOpen = activeFreeSeries === 0;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">New recurring series</span>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {searchParams?.bought === "SERIES_CREDIT" && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Series credit added — you now have <strong>{credits}</strong> credit{credits === 1 ? "" : "s"}.
            Finish setting up your series below (you can include the full-series pass).
          </div>
        )}
        <p className="mb-4 text-sm text-slate-600">
          A recurring series generates a real, independently-registerable event for each session on your schedule —
          so a weekly class always shows its next few months. You can cancel or reschedule any single session later.
        </p>

        {/* Credits status + in-context purchase */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Series credits: {credits}</span>
            <span className="ml-2 text-slate-500">
              {freeSlotOpen
                ? "Your free series slot is open — drop-in only, 50 registrations per session. A credit unlocks the full-series pass, unlimited registrations, and your branding."
                : "Your free series slot is in use — creating another series needs a credit ($34.99)."}
            </span>
          </div>
          <form action="/api/billing/checkout" method="POST">
            <input type="hidden" name="planKey" value="SERIES_CREDIT" />
            <input type="hidden" name="returnTo" value="/dashboard/series/new" />
            <button type="submit" className="btn-secondary whitespace-nowrap">Buy series credit — $34.99</button>
          </form>
        </div>

        <SeriesForm />
      </div>
    </main>
  );
}
