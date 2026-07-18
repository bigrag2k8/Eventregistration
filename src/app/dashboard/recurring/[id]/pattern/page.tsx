import Link from "next/link";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireRolePage, orgScope } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SubmitButton } from "@/components/SubmitButton";
import { RecurringPatternFields } from "@/components/RecurringPatternFields";
import { describeRecurrence } from "@/server/recurring-rule";
import { changeRecurringPatternAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ChangePatternPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId && session.role !== "SUPERADMIN") redirect("/dashboard");
  await requirePlanSelected(session);

  const re = await prisma.recurringEvent.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!re) redirect("/dashboard?error=not_found");

  const now = new Date();
  const [emptyUpcoming, committedUpcoming, passHolders] = await Promise.all([
    prisma.event.count({
      where: { recurringEventId: re.id, deletedAt: null, endAt: { gte: now }, registrations: { none: {} } },
    }),
    prisma.event.count({
      where: { recurringEventId: re.id, deletedAt: null, endAt: { gte: now }, registrations: { some: {} } },
    }),
    prisma.passPurchase.count({ where: { recurringEventId: re.id, status: "CONFIRMED" } }),
  ]);

  const blocked = passHolders > 0;
  const hh = String(Math.floor(re.startTimeMinutes / 60)).padStart(2, "0");
  const mm = String(re.startTimeMinutes % 60).padStart(2, "0");
  const todayLocal = formatInTimeZone(now, re.timezone, "yyyy-MM-dd");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-400">Change repeat pattern</p>
        <Link href={`/dashboard/recurring/${re.id}/edit`} className="text-sm text-brand-700 hover:underline">
          ◀ Back to edit
        </Link>
      </div>
        <ErrorBanner code={searchParams?.error} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{re.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Currently: <strong>{describeRecurrence(re)}</strong> · {re.timezone}
          </p>
        </div>

        {blocked ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="text-base font-semibold">Can&rsquo;t change the pattern yet</h2>
            <p className="mt-2">
              {passHolders} attendee{passHolders === 1 ? " holds" : "s hold"} an <strong>all-sessions pass</strong> for this
              recurring event. That pass promises a seat in <em>every</em> session — a new pattern creates sessions they
              never bought, so changing it would quietly break the deal they paid for.
            </p>
            <p className="mt-2">
              Refund {passHolders === 1 ? "that pass" : "those passes"} first (cancel the sessions they cover, which
              refunds automatically), then come back.
            </p>
            <Link href={`/dashboard/recurring/${re.id}/edit`} className="btn-secondary mt-4 inline-block">
              Back to edit
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <h2 className="font-semibold">What this will do</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>{emptyUpcoming} upcoming session{emptyUpcoming === 1 ? "" : "s"} with nobody registered</strong>{" "}
                  {emptyUpcoming === 1 ? "is" : "are"} removed and laid out again on the new pattern.
                </li>
                <li>
                  <strong>{committedUpcoming} upcoming session{committedUpcoming === 1 ? "" : "s"} with attendees</strong>{" "}
                  {committedUpcoming === 1 ? "keeps its" : "keep their"} current date and time — people keep what they
                  bought. The new pattern runs alongside {committedUpcoming === 1 ? "it" : "them"}, so a date may appear
                  twice until {committedUpcoming === 1 ? "it has" : "they have"} passed.
                </li>
                <li>Past sessions are never touched — they stay as history under this recurring event.</li>
                <li>
                  The pattern applies <strong>from the new start date onward</strong>; it never back-fills dates before it.
                </li>
              </ul>
              {committedUpcoming > 0 && (
                <p className="mt-2">
                  Want a clean switch instead? Cancel those {committedUpcoming} session
                  {committedUpcoming === 1 ? "" : "s"} first (which refunds attendees), then change the pattern.
                </p>
              )}
            </div>

            <form action={changeRecurringPatternAction} className="mt-6 space-y-6">
              <input type="hidden" name="recurringEventId" value={re.id} />
              <section className="card">
                <h2 className="text-lg font-semibold">New pattern</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Times are in {re.timezone} — the recurring event&rsquo;s timezone can&rsquo;t be changed here.
                </p>
                <div className="mt-4">
                  <RecurringPatternFields
                    frequency={re.frequency as "DAILY" | "WEEKLY" | "MONTHLY"}
                    interval={re.interval}
                    byWeekday={re.byWeekday}
                    monthlyMode={re.monthlyMode as "DAY_OF_MONTH" | "NTH_WEEKDAY" | null}
                    startDate={todayLocal}
                    startTime={`${hh}:${mm}`}
                    durationMinutes={re.durationMinutes}
                  />
                </div>
              </section>

              <div className="flex items-center justify-between gap-3">
                <Link href={`/dashboard/recurring/${re.id}/edit`} className="btn-secondary">Cancel</Link>
                <SubmitButton className="btn-primary" pendingText="Rebuilding schedule…">
                  Change pattern &amp; rebuild
                </SubmitButton>
              </div>
            </form>
          </>
        )}
    </main>
  );
}
