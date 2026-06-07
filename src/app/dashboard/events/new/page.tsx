import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { createEventAction } from "./actions";

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

export default async function NewEventPage() {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  if (!session.orgId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">No organization linked to your account</h1>
        <p className="mt-2 text-slate-600">Ask your admin to add you to an organization.</p>
      </main>
    );
  }

  // Default start = next Saturday 9am local, end = same day 5pm
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  next.setHours(9, 0, 0, 0);
  const defaultStart = next.toISOString().slice(0, 16);
  const endDate = new Date(next);
  endDate.setHours(17, 0, 0, 0);
  const defaultEnd = endDate.toISOString().slice(0, 16);

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
