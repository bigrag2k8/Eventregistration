import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { createEventAction } from "./actions";
import { BannerImageInput } from "@/components/BannerImageInput";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EventWizard } from "@/components/EventWizard";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { EventTierProvider, EventTypePicker, TicketPriceField, TicketQuantityField, CapacityField, VendorSettingsFields } from "@/components/EventTierForm";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC",
];

const CATEGORIES = EVENT_CATEGORIES;

export default async function NewEventPage({ searchParams }: { searchParams: { error?: string; bought?: string; canceled?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  await requirePlanSelected(session);
  if (!session.orgId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">No organization linked to your account</h1>
        <p className="mt-2 text-slate-600">Ask your admin to add you to an organization.</p>
      </main>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { singleEventCredits: true, stripeAccountChargesEnabled: true },
  });
  const credits = org?.singleEventCredits ?? 0;
  const chargesEnabled = !!org?.stripeAccountChargesEnabled;
  // First-timer intro: only when the org has never created an event.
  const isFirstEvent = (await prisma.event.count({ where: { organizationId: session.orgId } })) === 0;

  // Default start = next Saturday 9am local, end = same day 5pm
  // Default to next Saturday. Build the datetime-local default as a literal
  // wall-clock string (no toISOString — that would shift it by the server's
  // UTC offset). The organizer reads it as a time in their chosen timezone.
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  const ymd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  const defaultStart = `${ymd}T09:00`;
  const defaultEnd = `${ymd}T17:00`;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-sm text-brand-700">◀ Dashboard</Link>
          <h1 className="font-semibold">Create event</h1>
        </div>
      </header>

      <form action={createEventAction} className="mx-auto max-w-3xl px-4 py-8">
        {/* If we returned here after a successful Single Event credit purchase, pre-select
            the Single Event tier so the form is in the state the buyer expects. */}
        <EventTierProvider initialTier={searchParams?.bought === "SINGLE_EVENT" ? "single_event" : "free"}>
        <div className="mb-6 space-y-4">
          <ErrorBanner code={searchParams?.error} />

          {isFirstEvent && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <strong>👋 Let&rsquo;s create your first event.</strong> We&rsquo;ll walk you through it step by step —
              fill in what you know and hit <strong>Next</strong>. Nothing goes live until the final step, and you can
              <strong> Save as draft</strong> anytime to finish later.
            </div>
          )}
          {searchParams?.bought === "SINGLE_EVENT" && (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
              ✓ Credit added — <strong>Single Event</strong> is selected in step 1. Finish the steps and save to apply it to this event.
            </div>
          )}
          {searchParams?.canceled && (
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
              Checkout was canceled. No charge was made.
            </div>
          )}
        </div>

        <EventWizard titles={["Type", "Basics", "Date & time", "Location", "Tickets", "Settings", "Review"]}>
        <div className="space-y-6">
        <EventTypePicker credits={credits} />
        </div>

        <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold">Basics</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Event name *</label>
              <input name="name" required maxLength={200} className="input" placeholder="Summer Networking Mixer" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Short description (1 line)</label>
              <input name="shortDescription" maxLength={160} className="input" placeholder="A casual evening of drinks and conversation" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Full description *</label>
              <textarea name="description" required rows={5} className="input" placeholder="Tell attendees what to expect…" />
            </div>
            <div>
              <label className="label">Category</label>
              <select name="category" className="input">
                <option value="">— Pick one —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input name="tags" className="input" placeholder="networking, summer, free" />
            </div>
            <div className="sm:col-span-2">
              <BannerImageInput />
            </div>
          </div>
        </section>
        </div>

        <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold">When</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Start *</label>
              <input name="startAt" type="datetime-local" required defaultValue={defaultStart} className="input" />
            </div>
            <div>
              <label className="label">End *</label>
              <input name="endAt" type="datetime-local" required defaultValue={defaultEnd} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Timezone</label>
              <select name="timezone" defaultValue="America/Los_Angeles" className="input">
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </section>
        </div>

        <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold">Where</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isVirtual" value="1" />
                This is a virtual event
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Venue name</label>
              <input name="venueName" className="input" placeholder="Acme Conference Center" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address line 1</label>
              <input name="addressLine1" className="input" placeholder="123 Main St" />
            </div>
            <div>
              <label className="label">City</label>
              <input name="city" className="input" />
            </div>
            <div>
              <label className="label">State</label>
              <input name="state" className="input" />
            </div>
            <div>
              <label className="label">Postal code</label>
              <input name="postalCode" className="input" />
            </div>
            <div>
              <label className="label">Country</label>
              <input name="country" defaultValue="US" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Virtual URL (for virtual events)</label>
              <input name="virtualUrl" type="url" className="input" placeholder="https://zoom.us/j/..." />
            </div>
          </div>
        </section>
        </div>

        <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold">First ticket type</h2>
          <p className="mt-1 text-sm text-slate-500">You can add more after creating the event.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Ticket name *</label>
              <input name="ticketName" required defaultValue="General Admission" className="input" />
            </div>
            <TicketPriceField chargesEnabled={chargesEnabled} />
            <TicketQuantityField />
            <div>
              <label className="label">Max per order</label>
              <input name="ticketMaxPerOrder" type="number" min="1" defaultValue="10" className="input" />
            </div>
          </div>
        </section>
        </div>

        <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold">Settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <CapacityField />
            <div>
              <label className="label">Contact email</label>
              <input name="contactEmail" type="email" className="input" placeholder="hello@yourorg.com" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Refund policy</label>
              <textarea name="refundPolicy" rows={2} className="input" placeholder="Refunds available up to 14 days before the event." />
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="isPrivate" value="1" className="mt-1" />
                <span>
                  <span className="font-bold">Make this event private</span>
                  <br />
                  <span className="text-xs text-slate-500">Hides the event from yourevents.app and your public org page. People can still register if you share the direct link.</span>
                </span>
              </label>
            </div>
            <VendorSettingsFields />
          </div>
        </section>
        </div>
        </EventWizard>
        </EventTierProvider>
      </form>
    </main>
  );
}
