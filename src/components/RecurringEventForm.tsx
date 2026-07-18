"use client";

import { useState } from "react";
import { createRecurringEventAction } from "@/app/dashboard/recurring/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { EventLocationFields } from "@/components/EventLocationFields";
import { EVENT_CATEGORIES } from "@/lib/categories";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC", "Europe/London",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurringEventForm({
  defaultTimezone = "America/New_York",
  canOfferPass = false,
}: {
  defaultTimezone?: string;
  /** The all-sessions pass is premium-only; disabled until the org holds a credit. */
  canOfferPass?: boolean;
}) {
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [days, setDays] = useState<Set<number>>(new Set([1])); // default Monday
  const intervalUnit = frequency === "DAILY" ? "day(s)" : frequency === "WEEKLY" ? "week(s)" : "month(s)";
  // Free events run up to 2 sessions; a $19 credit (canOfferPass) raises it to 12.
  const maxSessions = canOfferPass ? 12 : 2;

  function toggleDay(n: number) {
    setDays((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  }

  return (
    <form action={createRecurringEventAction} className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">Basics</h2>
        <div className="mt-3 grid gap-4">
          <div>
            <label className="label" htmlFor="s-name">Name *</label>
            <input id="s-name" name="name" required maxLength={120} className="input" placeholder="Tuesday Night Yoga" />
          </div>
          <div>
            <label className="label" htmlFor="s-desc">Description</label>
            <textarea id="s-desc" name="description" rows={3} maxLength={4000} className="input"
                      placeholder="What each session is like, what to bring, etc." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-category">Category</label>
              <select id="s-category" name="category" className="input">
                <option value="">— Pick one —</option>
                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-tz">Time zone *</label>
              <select id="s-tz" name="timezone" defaultValue={defaultTimezone} className="input">
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="isPrivate" className="h-4 w-4 rounded border-slate-300" />
            Private — reachable by direct link only, hidden from the app-wide directory
          </label>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">When it repeats</h2>
        <div className="mt-3 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-freq">Repeats *</label>
              <select id="s-freq" name="frequency" value={frequency}
                      onChange={(e) => setFrequency(e.target.value as any)} className="input">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-interval">Every</label>
              <div className="flex items-center gap-2">
                <input id="s-interval" name="interval" type="number" min={1} max={52} defaultValue={1} className="input w-24" />
                <span className="text-sm text-slate-600">{intervalUnit}</span>
              </div>
            </div>
          </div>

          {frequency === "WEEKLY" && (
            <div>
              <span className="label">On these days *</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => (
                  <label key={i} className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ${days.has(i) ? "bg-brand-50 text-brand-800 ring-brand-300" : "ring-slate-200 text-slate-600"}`}>
                    <input type="checkbox" name="byWeekday" value={i} checked={days.has(i)} onChange={() => toggleDay(i)} className="sr-only" />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          )}

          {frequency === "MONTHLY" && (
            <div>
              <span className="label">Monthly pattern</span>
              <div className="mt-1 space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="monthlyMode" value="DAY_OF_MONTH" defaultChecked /> Same day of the month (e.g. the 15th)
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="monthlyMode" value="NTH_WEEKDAY" /> Same weekday (e.g. the 2nd Tuesday)
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-500">The pattern is taken from your start date below.</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="s-start">Starts on *</label>
              <input id="s-start" name="startDate" type="date" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="s-time">Start time *</label>
              <input id="s-time" name="startTime" type="time" required defaultValue="18:00" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="s-dur">Length (minutes) *</label>
              <input id="s-dur" name="durationMinutes" type="number" min={5} max={1440} defaultValue={60} className="input" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-end">Ends on (optional)</label>
              <input id="s-end" name="endDate" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="s-cap">…or after this many sessions (max {maxSessions})</label>
              <input
                id="s-cap"
                name="occurrenceCap"
                type="number"
                min={1}
                max={maxSessions}
                defaultValue={canOfferPass ? undefined : 2}
                className="input"
                placeholder={`e.g. ${maxSessions}`}
              />
            </div>
          </div>
          {canOfferPass ? (
            <p className="text-xs text-slate-500">
              Your credit lets you schedule <strong>up to 12 sessions</strong>. Set an end date or a session count to say
              how many; leave both blank for a short 2-session run.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              A free recurring event runs <strong>up to 2 sessions</strong>. Want more? Buy a{" "}
              <strong>$19 credit</strong> above to schedule up to 12.
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Banner (optional)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shown on the recurring event&rsquo;s page and on every session&rsquo;s page. You can still change an
          individual session&rsquo;s banner later from that event&rsquo;s page.
        </p>
        <div className="mt-4">
          <ImageUploadInput
            name="bannerUrl"
            label="Banner"
            aspect="16 / 6"
            previewFit="cover"
            folder="eventflow/banners"
            placeholder="https://yourorg.com/class-banner.jpg"
            hint="Wide image (~1600×600 looks best). Upload a file or paste a public URL."
          />
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Location</h2>
        <p className="mt-1 text-sm text-slate-500">
          Where every session happens. Copied onto each session — if one date moves venues,
          edit that session&rsquo;s location on its event page.
        </p>
        <div className="mt-4">
          <EventLocationFields />
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Tickets (drop-in per session)</h2>
        <p className="mt-1 text-sm text-slate-500">Each session sells tickets on its own — attendees register per date. Multi-session passes are coming later.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="s-tname">Ticket name *</label>
            <input id="s-tname" name="ticketName" required maxLength={80} defaultValue="General admission" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s-price">Price (USD) *</label>
            <input id="s-price" name="priceDollars" type="number" min={0} step="0.01" defaultValue={0} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s-capacity">Capacity per session</label>
            <input id="s-capacity" name="capacity" type="number" min={1} className="input" placeholder="unlimited" />
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
          <label className={`label ${canOfferPass ? "" : "opacity-60"}`} htmlFor="s-bundle">All-sessions pass price (USD, optional)</label>
          <input
            id="s-bundle"
            name="bundlePriceDollars"
            type="number"
            min={0.5}
            step="0.01"
            disabled={!canOfferPass}
            className={`input max-w-xs ${canOfferPass ? "" : "opacity-60"}`}
            placeholder="e.g. 100.00"
          />
          <p className="mt-1 text-xs text-slate-500">
            {canOfferPass ? (
              <>
                One checkout buys a seat in every remaining session — price it below the drop-in total so the discount
                shows. Needs an end date or session cap. Premium recurring events also get unlimited registrations per
                session and your custom branding.
              </>
            ) : (
              <>
                The all-sessions pass is a <strong>premium</strong> feature. Buy a{" "}
                <strong>recurring event credit ($19)</strong> above to unlock it, plus unlimited registrations per session
                and your custom branding.
              </>
            )}
          </p>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <SubmitButton className="btn-primary" pendingText="Creating…">Create recurring event</SubmitButton>
      </div>
    </form>
  );
}
