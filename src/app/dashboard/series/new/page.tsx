import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SeriesForm } from "@/components/SeriesForm";

export const dynamic = "force-dynamic";

export default async function NewSeriesPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">New recurring series</span>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        <p className="mb-6 text-sm text-slate-600">
          A recurring series generates a real, independently-registerable event for each session on your schedule —
          so a weekly class always shows its next few months. You can cancel or reschedule any single session later.
        </p>
        <SeriesForm />
      </div>
    </main>
  );
}
