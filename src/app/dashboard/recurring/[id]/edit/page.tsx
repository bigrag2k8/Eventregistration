import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage, orgScope } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SubmitButton } from "@/components/SubmitButton";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { EventLocationFields } from "@/components/EventLocationFields";
import { describeRecurrence } from "@/server/recurring-rule";
import { categoryOptions } from "@/lib/categories";
import { updateRecurringEventAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditRecurringEventPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string; updated?: string; skipped?: string };
}) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId && session.role !== "SUPERADMIN") redirect("/dashboard");
  await requirePlanSelected(session);

  const re = await prisma.recurringEvent.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!re) redirect("/dashboard?error=not_found");

  const now = new Date();
  const [upcomingCount, upcomingWithRegs] = await Promise.all([
    prisma.event.count({
      where: { recurringEventId: re.id, deletedAt: null, status: { not: "CANCELLED" }, endAt: { gte: now } },
    }),
    prisma.event.count({
      where: {
        recurringEventId: re.id,
        deletedAt: null,
        status: { not: "CANCELLED" },
        endAt: { gte: now },
        registrations: { some: { status: "CONFIRMED" } },
      },
    }),
  ]);

  const bounded = !!(re.seriesEnd || re.occurrenceCap);
  const updatedN = Number(searchParams?.updated ?? 0);
  const skippedN = Number(searchParams?.skipped ?? 0);

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">
              <img src="/logo.png" alt="Your Events App" className="h-9 w-auto" />
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Edit recurring event</span>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorBanner code={searchParams?.error} />

        {searchParams?.saved && (
          <div className="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Saved.{" "}
            {updatedN > 0
              ? `${updatedN} upcoming session${updatedN === 1 ? "" : "s"} updated.`
              : "Only the template was changed — upcoming sessions were left as they were."}
            {skippedN > 0 && (
              <>
                {" "}
                <strong>
                  Capacity was not lowered on {skippedN} session{skippedN === 1 ? "" : "s"}
                </strong>{" "}
                — they have already sold more tickets than the new capacity. Everything else was applied there.
              </>
            )}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{re.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {describeRecurrence(re)} · {re.status} · {upcomingCount} upcoming session{upcomingCount === 1 ? "" : "s"}
          </p>
        </div>

        <form action={updateRecurringEventAction} className="space-y-6">
          <input type="hidden" name="recurringEventId" value={re.id} />

          <section className="card">
            <h2 className="text-lg font-semibold">Basics</h2>
            <div className="mt-3 grid gap-4">
              <div>
                <label className="label" htmlFor="e-name">Name *</label>
                <input id="e-name" name="name" required maxLength={120} defaultValue={re.name} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="e-desc">Description</label>
                <textarea id="e-desc" name="description" rows={3} maxLength={4000} defaultValue={re.description} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="e-category">Category</label>
                <select id="e-category" name="category" defaultValue={re.category ?? ""} className="input">
                  <option value="">— Pick one —</option>
                  {categoryOptions(re.category).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" name="isPrivate" defaultChecked={re.isPrivate} className="h-4 w-4 rounded border-slate-300" />
                Private — reachable by direct link only, hidden from the app-wide directory
              </label>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Banner</h2>
            <div className="mt-4">
              <ImageUploadInput
                name="bannerUrl"
                label="Banner"
                aspect="16 / 6"
                previewFit="cover"
                folder="eventflow/banners"
                defaultUrl={re.bannerUrl ?? ""}
                placeholder="https://yourorg.com/class-banner.jpg"
                hint="Wide image (~1600×600 looks best). Upload a file or paste a public URL."
              />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Location</h2>
            {upcomingWithRegs > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>
                  {upcomingWithRegs} upcoming session{upcomingWithRegs === 1 ? " already has" : "s already have"} attendees.
                </strong>{" "}
                A venue change here is applied to them but they are <strong>not</strong> notified automatically — email them
                from each session&rsquo;s page if the location really moved.
              </div>
            )}
            <div className="mt-4">
              <EventLocationFields
                defaults={{
                  isVirtual: re.isVirtual,
                  virtualUrl: re.virtualUrl,
                  venueName: re.venueName,
                  addressLine1: re.addressLine1,
                  city: re.city,
                  state: re.state,
                  postalCode: re.postalCode,
                  country: re.country,
                }}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Tickets (drop-in per session)</h2>
            <p className="mt-1 text-sm text-slate-500">
              A new price applies to future sales only — anyone who already bought keeps what they paid.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="e-tname">Ticket name *</label>
                <input id="e-tname" name="ticketName" required maxLength={80} defaultValue={re.ticketName} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="e-price">Price (USD) *</label>
                <input id="e-price" name="priceDollars" type="number" min={0} step="0.01" defaultValue={(re.priceCents / 100).toFixed(2)} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="e-capacity">Capacity per session</label>
                <input id="e-capacity" name="capacity" type="number" min={1} defaultValue={re.capacity ?? ""} placeholder="unlimited" className="input" />
                <p className="mt-1 text-xs text-slate-400">Won&rsquo;t be lowered below tickets already sold.</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
              <label className="label" htmlFor="e-bundle">All-sessions pass price (USD, optional)</label>
              <input
                id="e-bundle"
                name="bundlePriceDollars"
                type="number"
                min={0.5}
                step="0.01"
                defaultValue={re.bundlePriceCents != null ? (re.bundlePriceCents / 100).toFixed(2) : ""}
                disabled={!re.isPremium || !bounded}
                className={`input max-w-xs ${!re.isPremium || !bounded ? "opacity-60" : ""}`}
                placeholder="e.g. 100.00"
              />
              <p className="mt-1 text-xs text-slate-500">
                {!re.isPremium
                  ? "Requires a recurring event credit ($34.99) — this one is on the free tier, so the pass can't be offered."
                  : !bounded
                    ? "Only available on a bounded recurring event (one with an end date or a session cap)."
                    : "One checkout buys a seat in every remaining session. Clear the field to stop offering it."}
              </p>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Apply to existing sessions</h2>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="propagate" value="1" defaultChecked className="mt-1" />
              <span>
                <span className="font-medium">
                  Also update {upcomingCount} upcoming session{upcomingCount === 1 ? "" : "s"}
                </span>
                <br />
                <span className="text-xs text-slate-500">
                  Past and cancelled sessions are never changed. Uncheck to change the template only — future sessions
                  generated from now on will use the new values, existing ones keep theirs.
                </span>
              </span>
            </label>
          </section>

          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="btn-secondary">Cancel</Link>
            <SubmitButton className="btn-primary" pendingText="Saving…">Save changes</SubmitButton>
          </div>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          The schedule ({describeRecurrence(re)}) and the public link can&rsquo;t be changed here — cancel or reschedule an
          individual session from its own page instead.
        </p>
      </div>
    </main>
  );
}
