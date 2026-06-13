import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { SignOutButton } from "@/components/SignOutButton";
import { createEventAction } from "./actions";
import { BannerImageInput } from "@/components/BannerImageInput";
import { ErrorBanner } from "@/components/ErrorBanner";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC",
];

const CATEGORIES = [
  "Technology", "Business", "Education", "Health & Wellness",
  "Arts", "Music", "Sports", "Community", "Nonprofit",
  "Networking", "Workshop", "Conference", "Training", "Other",
];

export default async function NewEventPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
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
    select: { singleEventCredits: true },
  });
  const credits = org?.singleEventCredits ?? 0;

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
          <SignOutButton />
        </div>
      </header>

      <form action={createEventAction} className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />

        <section className="card">
          <h2 className="text-lg font-semibold">Event type</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick how this event is powered. You can also upgrade a free event later.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col rounded-xl border border-slate-200 p-4 hover:border-brand-300">
              <span className="flex items-center gap-2">
                <input type="radio" name="tier" value="free" defaultChecked />
                <span className="font-semibold">Free event</span>
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Up to 50 registrations, 1 email broadcast, basic features. No charge.
              </span>
            </label>
            <label className={`flex flex-col rounded-xl border border-slate-200 p-4 ${credits < 1 ? "opacity-70" : "cursor-pointer hover:border-brand-300"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="tier" value="single_event" disabled={credits < 1} />
                <span className="font-semibold">
                  Single Event{credits < 1 && <span className="font-normal text-slate-400"> — needs a credit</span>}
                </span>
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Unlimited registrations, vendor applications, custom branding, 5 email broadcasts. Uses 1 credit.
              </span>
              <span className="mt-2 text-xs">
                {credits > 0 ? (
                  <span className="text-emerald-700">You have {credits} credit{credits === 1 ? "" : "s"} — this event uses 1.</span>
                ) : (
                  <Link href="/dashboard/billing" className="font-medium text-brand-700 hover:underline">Buy a credit ($19) →</Link>
                )}
              </span>
            </label>
          </div>
        </section>

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

        <section className="card">
          <h2 className="text-lg font-semibold">First ticket type</h2>
          <p className="mt-1 text-sm text-slate-500">You can add more after creating the event.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Ticket name *</label>
              <input name="ticketName" required defaultValue="General Admission" className="input" />
            </div>
            <div>
              <label className="label">Price (USD) — 0 for free</label>
              <input name="ticketPrice" type="number" step="0.01" min="0" defaultValue="0" className="input" />
            </div>
            <div>
              <label className="label">Quantity available (blank = unlimited)</label>
              <input name="ticketQuantity" type="number" min="1" className="input" placeholder="100" />
            </div>
            <div>
              <label className="label">Max per order</label>
              <input name="ticketMaxPerOrder" type="number" min="1" defaultValue="10" className="input" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Capacity (blank = unlimited)</label>
              <input name="capacity" type="number" min="1" className="input" placeholder="500" />
            </div>
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
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="vendorRegistrationEnabled" value="1" className="mt-1" />
                <span>
                  <span className="font-medium">Accept vendor applications</span>
                  <br />
                  <span className="text-xs text-slate-500">Adds a "Become a Vendor" button to the event page. Vendors submit applications you approve before payment.</span>
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Vendor application notes (shown on the vendor form)</label>
              <textarea name="vendorApplicationNotes" rows={3} className="input" placeholder="e.g. Booths are 10x10 with table and chairs. Load-in 7am day of event." />
            </div>
            <div>
              <label className="label">Default vendor booth price (USD)</label>
              <input name="defaultVendorPrice" type="number" step="0.01" min="0" defaultValue="0" className="input" placeholder="500.00" />
              <p className="mt-1 text-xs text-slate-500">Pre-fills the quote when approving a vendor. You can override per vendor.</p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="btn-secondary">Cancel</Link>
          <div className="flex gap-2">
            <button type="submit" name="action" value="draft" className="btn-secondary">Save as draft</button>
            <button type="submit" name="action" value="publish" className="btn-primary">Save & publish</button>
          </div>
        </div>
      </form>
    </main>
  );
}
