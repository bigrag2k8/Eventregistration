import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage, orgScope } from "@/lib/auth";
import { formatDateRange, money } from "@/lib/format";
import { revenueSplit, perTicketTypeBreakdown } from "@/server/finance";
import { publishAction, unpublishAction, deleteAction, addTicketTypeAction, deleteTicketTypeAction, updateBasicsAction, updateLocationAction, updatePresaleAction, upgradeEventAction } from "./actions";
import { BannerImageInput } from "@/components/BannerImageInput";
import { PresaleFields } from "@/components/PresaleFields";
import { EventLocationFields } from "@/components/EventLocationFields";
import { AddTicketFields } from "@/components/AddTicketFields";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ConfirmButton } from "@/components/ConfirmButton";
import { QrButton } from "./QrButton";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC",
];

export default async function EventManagePage({ params, searchParams }: { params: { id: string }; searchParams: { saved?: string; error?: string; upgraded?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);

  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
    include: {
      location: true,
      ticketTypes: { orderBy: { sortOrder: "asc" } },
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });
  if (!event) return notFound();

  const totalRevenue = await prisma.payment.aggregate({
    where: { status: "SUCCEEDED", registration: { eventId: event.id } },
    _sum: { amountCents: true },
  });

  const [evSplit, byType] = await Promise.all([
    revenueSplit({ eventId: event.id }),
    perTicketTypeBreakdown(event.id),
  ]);
  const evGross = evSplit.ticket.grossCents + evSplit.vendor.grossCents;
  const evRefunds = evSplit.ticket.refundedCents + evSplit.vendor.refundedCents;
  const evFees = evSplit.ticket.feeCents + evSplit.vendor.feeCents;
  const evNet = evSplit.ticket.netCents + evSplit.vendor.netCents;
  const evPayout = evSplit.ticket.payoutCents + evSplit.vendor.payoutCents;

  // Presale (early-bird) discount state for this event.
  const hasPaidTickets = event.ticketTypes.some((t) => !t.isVendorTier && t.priceCents > 0);
  const presalePct = event.presalePercent != null ? Number(event.presalePercent) : null;
  const presaleEnabled = presalePct != null && presalePct > 0 && event.presaleEndsAt != null;
  const presaleActive = presaleEnabled && event.presaleEndsAt! > new Date();
  const presaleEndsLocal = event.presaleEndsAt
    ? formatInTimeZone(event.presaleEndsAt, event.timezone, "yyyy-MM-dd'T'HH:mm")
    : "";
  const presalePrice = (cents: number) =>
    presalePct != null ? Math.round(cents * (1 - presalePct / 100)) : cents;

  // Use the event's org, not the session's, so SUPERADMIN viewing another org's event gets the right public slug.
  const org = await prisma.organization.findUnique({ where: { id: event.organizationId } });
  const publicUrl = `/o/${org?.slug ?? "_"}/events/${event.slug}`;
  const isPublished = event.status === "PUBLISHED";

  // Uniform action-grid box styles: same fixed height/width so the row of
  // event actions reads as a tidy grid instead of squished pills.
  const actionBoxBase =
    "flex min-h-[3.5rem] w-full items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium leading-tight ring-1 transition";
  const actionBox = `${actionBoxBase} bg-white text-slate-700 ring-slate-200 hover:bg-slate-50`;
  const actionBoxPrimary = `${actionBoxBase} bg-brand-600 text-white ring-brand-600 hover:bg-brand-700`;
  const actionBoxDisabled = `${actionBoxBase} cursor-not-allowed bg-white text-slate-400 ring-slate-200 opacity-60`;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-brand-700">◀ Dashboard</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              isPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}>{event.status}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              event.isPremium ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
            }`}>{event.isPremium ? "Single Event" : "Free"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={publicUrl} target="_blank" className="btn-secondary">View public page ↗</Link>
            <Link href={`/checkin/${event.id}`} className="btn-secondary">Check-in</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Registered" value={String(event._count.registrations)} />
          <Stat label="Revenue" value={money(totalRevenue._sum.amountCents ?? 0)} />
          <Stat label="Capacity" value={event.capacity ? `${event._count.registrations} / ${event.capacity}` : "Unlimited"} />
        </div>

        {searchParams?.upgraded && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ This event is now a <strong>Single Event</strong> — premium features unlocked.
          </div>
        )}

        {/* Event type / upgrade */}
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{event.isPremium ? "Single Event (premium)" : "Free event"}</h2>
            <p className="text-sm text-slate-500">
              {event.isPremium
                ? "Unlimited registrations, vendor applications, custom branding, 5 email broadcasts."
                : "Up to 50 registrations, 1 email broadcast, basic features. Upgrade to unlock vendors, branding, and unlimited registrations."}
            </p>
          </div>
          {!event.isPremium && (
            (org?.singleEventCredits ?? 0) >= 1 ? (
              <form action={upgradeEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className="btn-primary">Upgrade to Single Event (1 credit)</button>
              </form>
            ) : (
              <Link href="/dashboard/billing" className="btn-primary">Buy a credit ($19) to upgrade</Link>
            )
          )}
        </section>

        {/* Financials */}
        <section className="card">
          <h2 className="text-lg font-semibold">Financials</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Ticket revenue" value={money(evSplit.ticket.netCents)} hint={`${evSplit.ticket.count} sold`} />
            <MiniStat label="Vendor revenue" value={money(evSplit.vendor.netCents)} hint={`${evSplit.vendor.count} booth${evSplit.vendor.count === 1 ? "" : "s"}`} />
            <MiniStat label="Total net" value={money(evNet)} />
            <MiniStat label="Net payout" value={money(evPayout)} hint="After platform fee" />
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
            <div>Gross collected: <strong>{money(evGross)}</strong></div>
            <div>Refunds: <strong>{money(evRefunds)}</strong></div>
            <div>Platform fee: <strong>{money(evFees)}</strong></div>
          </div>
          {byType.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Ticket type</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byType.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-medium">
                        {t.name}
                        {t.isVendor && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">vendor</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{t.qty}</td>
                      <td className="px-3 py-2 text-right">{money(t.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Publish / unpublish + actions */}
        <section className="card">
          <div>
            <h2 className="font-semibold">{isPublished ? "This event is live" : "This event is a draft"}</h2>
            <p className="text-sm text-slate-500">
              {isPublished ? "Anyone with the link can register." : "Not visible to attendees yet."}
            </p>
          </div>
          {/* Uniform action grid — equal-size boxes, two rows on wide screens. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {isPublished ? (
              <form action={unpublishAction} className="contents">
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={actionBox}>Unpublish</button>
              </form>
            ) : (
              <form action={publishAction} className="contents">
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={actionBoxPrimary}>Publish event</button>
              </form>
            )}
            <Link href={`/dashboard/events/${event.id}/registrations`} className={actionBox}>View registrations</Link>
            {event.isPremium ? (
              <Link href={`/dashboard/events/${event.id}/vendors`} className={actionBox}>Vendors</Link>
            ) : (
              <span className={actionBoxDisabled} title="Upgrade this event to Single Event to enable vendors">Vendors</span>
            )}
            {event.isPremium ? (
              <Link href="/dashboard/team" className={actionBox}>Team</Link>
            ) : (
              <span className={actionBoxDisabled} title="Upgrade this event to Single Event to enable team">Team</span>
            )}
            <Link href={`/dashboard/events/${event.id}/promo-codes`} className={actionBox}>Promo codes</Link>
            <Link href={`/dashboard/events/${event.id}/waitlist`} className={actionBox}>Waitlist</Link>
            <Link href={`/dashboard/events/${event.id}/refund-requests`} className={actionBox}>Refund requests</Link>
            <Link href={`/dashboard/events/${event.id}/campaigns`} className={actionBox}>Communications</Link>
            <QrButton href={`/qr/event/${event.id}`} className={actionBox} />
            <details className="relative">
              <summary className={`${actionBox} w-full cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}>Export CSV ▾</summary>
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                <a href={`/api/events/${event.id}/export.csv?type=registrations`} className="block px-3 py-2 text-sm hover:bg-slate-50">Registrations</a>
                <a href={`/api/events/${event.id}/export.csv?type=vendors`} className="block px-3 py-2 text-sm hover:bg-slate-50">Vendors</a>
              </div>
            </details>
          </div>
        </section>

        {/* Saved toast (shown after updateBasicsAction redirects back with ?saved=1) */}
        {searchParams?.saved && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Changes saved. Your public event page reflects them immediately.
          </div>
        )}
        <ErrorBanner code={searchParams?.error} />

        {/* Basics editor */}
        <section className="card">
          <h2 className="text-lg font-semibold">Basics</h2>
          <form action={updateBasicsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="eventId" value={event.id} />
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input name="name" required defaultValue={event.name} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Short description</label>
              <input name="shortDescription" defaultValue={event.shortDescription ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea name="description" required rows={4} defaultValue={event.description} className="input" />
            </div>
            <div>
              <label className="label">Start</label>
              <input name="startAt" type="datetime-local" required defaultValue={formatInTimeZone(event.startAt, event.timezone, "yyyy-MM-dd'T'HH:mm")} className="input" />
            </div>
            <div>
              <label className="label">End</label>
              <input name="endAt" type="datetime-local" required defaultValue={formatInTimeZone(event.endAt, event.timezone, "yyyy-MM-dd'T'HH:mm")} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Timezone</label>
              <select name="timezone" defaultValue={event.timezone} className="input">
                {(TIMEZONES.includes(event.timezone) ? TIMEZONES : [event.timezone, ...TIMEZONES]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Capacity</label>
              <input name="capacity" type="number" min="1" defaultValue={event.capacity ?? ""} className="input" placeholder="Unlimited" />
            </div>
            <div>
              <label className="label">Contact email</label>
              <input name="contactEmail" type="email" defaultValue={event.contactEmail ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Refund policy</label>
              <textarea name="refundPolicy" rows={2} defaultValue={event.refundPolicy ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <BannerImageInput defaultUrl={event.bannerUrl} />
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isPrivate"
                  value="1"
                  defaultChecked={event.isPrivate}
                  className="mt-1"
                />
                <span>
                  <span className="font-bold">Make this event private</span>
                  <br />
                  <span className="text-xs text-slate-500">
                    Hides the event from yourevents.app and your public org page. People can still register if you share the direct link.
                  </span>
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={`flex items-start gap-2 text-sm ${event.isPremium ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  name="vendorRegistrationEnabled"
                  value="1"
                  defaultChecked={event.vendorRegistrationEnabled}
                  disabled={!event.isPremium}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Accept vendor applications</span>
                  {!event.isPremium && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Single Event feature</span>}
                  <br />
                  <span className="text-xs text-slate-500">
                    Adds a "Become a Vendor" button on the public event page. Vendors submit
                    applications you review before sending a payment link.
                    {!event.isPremium && " Upgrade this event to Single Event to enable it."}
                  </span>
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Vendor application notes (shown on the vendor form)</label>
              <textarea
                name="vendorApplicationNotes"
                rows={3}
                defaultValue={event.vendorApplicationNotes ?? ""}
                className="input"
                placeholder="e.g. Booths are 10x10 with table and chairs. Load-in 7am day of event."
              />
            </div>
            <div>
              <label className="label">Default vendor booth price (USD)</label>
              <input
                name="defaultVendorPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={(event.defaultVendorPriceCents / 100).toFixed(2)}
                className="input"
              />
              <p className="mt-1 text-xs text-slate-500">Pre-fills the quote when approving a vendor. Override per-vendor on the Vendors page.</p>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Save changes</button>
            </div>
          </form>
        </section>

        {/* Ticket types */}
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ticket types</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  {presaleEnabled && <th className="px-3 py-2 text-right">Presale</th>}
                  <th className="px-3 py-2 text-right">Sold / Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {event.ticketTypes.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 text-slate-500">{t.kind}</td>
                    <td className="px-3 py-2 text-right">{t.priceCents === 0 ? "Free" : money(t.priceCents)}</td>
                    {presaleEnabled && (
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">
                        {t.priceCents === 0 ? "Free" : money(presalePrice(t.priceCents))}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {t.quantitySold} / {t.quantityTotal ?? "∞"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteTicketTypeAction} className="inline">
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="ticketTypeId" value={t.id} />
                        <button type="submit"
                          className="text-xs text-red-600 hover:underline"
                          disabled={t.quantitySold > 0}
                          title={t.quantitySold > 0 ? "Has registrations" : "Delete"}>
                          {t.quantitySold > 0 ? "—" : "Delete"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={addTicketTypeAction} className={`mt-6 grid gap-3 ${presaleEnabled ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
            <input type="hidden" name="eventId" value={event.id} />
            <div className="sm:col-span-2">
              <label className="label">New ticket name</label>
              <input name="name" required className="input" placeholder="VIP" />
            </div>
            <AddTicketFields presalePercent={presaleEnabled ? presalePct : null} />
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full">Add ticket type</button>
            </div>
          </form>
        </section>

        {/* Location — venue + address (or virtual URL) */}
        <section className="card">
          <h2 className="text-lg font-semibold">Location</h2>
          <p className="mt-1 text-sm text-slate-500">
            Update the venue name, street address, or virtual meeting URL. The map and directions
            link on the public event page refresh as soon as you save.
          </p>
          <form action={updateLocationAction} className="mt-4">
            <input type="hidden" name="eventId" value={event.id} />
            <EventLocationFields
              defaults={{
                isVirtual: event.location?.isVirtual,
                virtualUrl: event.location?.virtualUrl,
                venueName: event.location?.venueName,
                addressLine1: event.location?.addressLine1,
                city: event.location?.city,
                state: event.location?.state,
                postalCode: event.location?.postalCode,
                country: event.location?.country,
              }}
            />
            <div className="mt-4 flex justify-end">
              <button type="submit" className="btn-primary">Save location</button>
            </div>
          </form>
        </section>

        {/* Presale (early-bird) discount */}
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Presale discount</h2>
            {presaleEnabled && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${presaleActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {presaleActive
                  ? `Active · ${presalePct}% off until ${formatInTimeZone(event.presaleEndsAt!, event.timezone, "MMM d, h:mm a")}`
                  : "Expired — selling at regular price"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Reward early buyers with a limited-time discount on every ticket type. Set this up after you&rsquo;ve added your tickets.
          </p>
          <form action={updatePresaleAction} className="mt-4">
            <input type="hidden" name="eventId" value={event.id} />
            <PresaleFields
              defaultEnabled={presaleEnabled}
              defaultPercent={presalePct != null ? String(presalePct) : ""}
              defaultEndsAt={presaleEndsLocal}
              disabled={!hasPaidTickets}
            />
            {/* With no paid tickets the only useful submit is clearing a stale
                presale (the disabled checkbox doesn't post, so saving clears). */}
            {(hasPaidTickets || presaleEnabled) && (
              <div className="mt-4">
                <button type="submit" className="btn-primary">
                  {hasPaidTickets ? "Save presale settings" : "Clear presale"}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* Danger zone */}
        <section className="card border-red-200 ring-red-100">
          <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
          <form action={deleteAction} className="mt-3 flex items-center justify-between">
            <p className="text-sm text-slate-600">Soft-delete this event. Existing registrations remain.</p>
            <input type="hidden" name="eventId" value={event.id} />
            <ConfirmButton
              label="Delete event"
              confirmText={`Delete "${event.name}"? It will be removed from all public listings. This can't be undone from here.`}
              className="btn-secondary text-red-700 hover:bg-red-50"
            />
          </form>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
