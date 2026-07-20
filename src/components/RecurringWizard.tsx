"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import { EventLocationFields } from "@/components/EventLocationFields";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { EVENT_CATEGORIES } from "@/lib/categories";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC", "Europe/London",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TITLES = ["Type", "Basics", "Schedule", "Location", "Tickets", "Review"];

/** Build + submit a one-off POST to the billing checkout for a recurring-event
 *  credit. The picker lives inside the big recurring <form>, so we can't nest a
 *  second form — send it manually, same technique as EventTierForm. */
function buyRecurringCredit(returnTo: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/billing/checkout";
  const pk = document.createElement("input");
  pk.name = "planKey";
  pk.value = "RECURRING_EVENT_CREDIT";
  const rt = document.createElement("input");
  rt.name = "returnTo";
  rt.value = returnTo;
  form.appendChild(pk);
  form.appendChild(rt);
  document.body.appendChild(form);
  form.submit();
}

/**
 * Self-contained stepper for creating a recurring event (modeled on
 * ConferenceWizard). Wraps `<form action={createRecurringEventAction}>` — every
 * field `name` matches the old RecurringEventForm, so the server action is
 * unchanged. The Type step's Free / Premium Recurring choice is a UX affordance:
 * it reveals the premium fields (12 sessions, all-sessions pass), but the server
 * still infers the real premium/credit-spend from the schedule + bundle, so a
 * credit is never spent just by toggling the radio.
 */
export function RecurringWizard({
  credits,
  defaultTimezone = "America/New_York",
  initialPremium = false,
}: {
  credits: number;
  defaultTimezone?: string;
  /** Pre-select Premium Recurring on return from a credit purchase (?bought=RECURRING_EVENT_CREDIT). */
  initialPremium?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [premium, setPremium] = useState(initialPremium);
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [days, setDays] = useState<Set<number>>(new Set([1])); // default Monday
  const [cap, setCap] = useState("2");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [review, setReview] = useState<{ name: string; ticket: string; price: string; bundle: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const last = TITLES.length - 1;
  const maxSessions = premium ? 12 : 2;
  const intervalUnit = frequency === "DAILY" ? "day(s)" : frequency === "WEEKLY" ? "week(s)" : "month(s)";
  const returnTo = "/dashboard/events/new?format=recurring";

  // Keep the session cap within the tier's ceiling when switching Premium → Free.
  useEffect(() => {
    if (!premium && Number(cap) > 2) setCap("2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premium]);

  function toggleDay(n: number) {
    setDays((s) => {
      const x = new Set(s);
      x.has(n) ? x.delete(n) : x.add(n);
      return x;
    });
  }

  function form(): HTMLFormElement | null {
    return rootRef.current?.closest("form") ?? null;
  }

  function validateStep(index: number): boolean {
    const container = rootRef.current?.querySelectorAll<HTMLElement>("[data-wizard-step]")[index];
    if (!container) return true;
    const fields = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    for (const f of Array.from(fields)) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return false;
      }
    }
    // Schedule step: weekly runs need at least one weekday.
    if (index === 2 && frequency === "WEEKLY" && days.size === 0) {
      setScheduleError("Pick at least one day of the week.");
      return false;
    }
    setScheduleError(null);
    return true;
  }

  function goTo(index: number) {
    setStep(index);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    if (step < last && !validateStep(step)) return;
    goTo(Math.min(step + 1, last));
  }

  useEffect(() => {
    if (step !== last) return;
    const f = form();
    if (!f) return;
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    setReview({ name: val("name"), ticket: val("ticketName"), price: val("priceDollars"), bundle: val("bundlePriceDollars") });
  }, [step, last]);

  const cadence = (() => {
    const every = frequency === "DAILY" ? "day" : frequency === "WEEKLY" ? "week" : "month";
    const dayList = frequency === "WEEKLY" ? ` on ${[...days].sort((a, b) => a - b).map((d) => WEEKDAYS[d]).join(", ")}` : "";
    return `Every ${every}${dayList}`;
  })();

  return (
    <div ref={rootRef}>
      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {TITLES.map((t, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => i < step && goTo(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 ${i < step ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    active ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400"}>{t}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* 1. Type */}
      <div data-wizard-step hidden={step !== 0}>
        <section className="card">
          <h2 className="text-lg font-semibold">Event type</h2>
          <p className="mt-1 text-sm text-slate-500">
            A recurring event runs on a schedule and creates a real, independently-registerable session for each date.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer flex-col rounded-xl border p-4 ${
                !premium ? "border-brand-400 ring-2 ring-brand-500" : "border-slate-200 hover:border-brand-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="__recTier" checked={!premium} onChange={() => setPremium(false)} />
                <span className="font-semibold">Free</span>
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Up to 2 sessions, drop-in tickets, 50 registrations per session. No charge.
              </span>
            </label>

            <label
              className={`relative flex cursor-pointer flex-col rounded-xl border p-4 ${
                premium ? "border-brand-400 ring-2 ring-brand-500" : "border-amber-300 hover:border-amber-400"
              }`}
            >
              <span className="absolute -top-2.5 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                Recommended
              </span>
              <span className="flex items-center gap-2">
                <input type="radio" name="__recTier" checked={premium} onChange={() => setPremium(true)} />
                <span className="font-semibold">Premium Recurring</span>
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Up to 12 sessions, an all-sessions pass, unlimited registrations, and custom branding. Uses 1 recurring credit.
              </span>
              {credits > 0 ? (
                <span className="mt-2 text-xs text-emerald-700">
                  You have {credits} recurring credit{credits === 1 ? "" : "s"} — a premium run uses 1.
                </span>
              ) : (
                premium && (
                  <div className="mt-3 space-y-2">
                    <button type="button" onClick={() => buyRecurringCredit(returnTo)} className="btn-primary w-full">
                      Buy a recurring credit — $19
                    </button>
                    <p className="text-xs text-slate-500">
                      You&rsquo;ll be sent to checkout, then back here with the credit applied so you can finish.
                    </p>
                  </div>
                )
              )}
            </label>
          </div>
        </section>
      </div>

      {/* 2. Basics */}
      <div data-wizard-step hidden={step !== 1}>
        <section className="card">
          <h2 className="text-lg font-semibold">Basics</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="label" htmlFor="s-name">Name *</label>
              <input id="s-name" name="name" required maxLength={120} className="input" placeholder="Tuesday Night Yoga" />
            </div>
            <div>
              <label className="label" htmlFor="s-desc">Description</label>
              <textarea id="s-desc" name="description" rows={3} maxLength={4000} className="input" placeholder="What each session is like, what to bring, etc." />
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

        <section className="card mt-6">
          <h2 className="text-lg font-semibold">Banner (optional)</h2>
          <p className="mt-1 text-sm text-slate-500">Shown on the recurring event&rsquo;s page and on every session&rsquo;s page.</p>
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
      </div>

      {/* 3. Schedule */}
      <div data-wizard-step hidden={step !== 2}>
        <section className="card">
          <h2 className="text-lg font-semibold">When it repeats</h2>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-freq">Repeats *</label>
                <select id="s-freq" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="input">
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
              {premium && (
                <div>
                  <label className="label" htmlFor="s-end">Ends on (optional)</label>
                  <input id="s-end" name="endDate" type="date" className="input" />
                </div>
              )}
              <div>
                <label className="label" htmlFor="s-cap">Number of sessions (max {maxSessions})</label>
                <input
                  id="s-cap"
                  name="occurrenceCap"
                  type="number"
                  min={1}
                  max={maxSessions}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  className="input"
                  placeholder={`e.g. ${maxSessions}`}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {premium
                ? "Your credit lets you schedule up to 12 sessions. Set an end date or a session count to say how many."
                : "A free recurring event runs up to 2 sessions. Choose Premium Recurring on the Type step to schedule up to 12 and sell an all-sessions pass."}
            </p>
            {scheduleError && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{scheduleError}</div>
            )}
          </div>
        </section>
      </div>

      {/* 4. Location */}
      <div data-wizard-step hidden={step !== 3}>
        <section className="card">
          <h2 className="text-lg font-semibold">Location</h2>
          <p className="mt-1 text-sm text-slate-500">
            Where every session happens. Copied onto each session — if one date moves venues, edit that session later.
          </p>
          <div className="mt-4">
            <EventLocationFields />
          </div>
        </section>
      </div>

      {/* 5. Tickets */}
      <div data-wizard-step hidden={step !== 4}>
        <section className="card">
          <h2 className="text-lg font-semibold">Tickets (drop-in per session)</h2>
          <p className="mt-1 text-sm text-slate-500">Each session sells tickets on its own — attendees register per date.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
            <label className={`label ${premium ? "" : "opacity-60"}`} htmlFor="s-bundle">All-sessions pass price (USD, optional)</label>
            <input
              id="s-bundle"
              name="bundlePriceDollars"
              type="number"
              min={0.5}
              step="0.01"
              disabled={!premium}
              className={`input max-w-xs ${premium ? "" : "opacity-60"}`}
              placeholder="e.g. 100.00"
            />
            <p className="mt-1 text-xs text-slate-500">
              {premium ? (
                <>One checkout buys a seat in every remaining session — price it below the drop-in total so the discount shows. Needs a session count or end date.</>
              ) : (
                <>The all-sessions pass is a <strong>Premium Recurring</strong> feature. Choose it on the Type step to unlock it.</>
              )}
            </p>
          </div>
        </section>
      </div>

      {/* 6. Review */}
      <div data-wizard-step hidden={step !== last}>
        <section className="card">
          <h2 className="text-lg font-semibold">Review &amp; create</h2>
          <p className="mt-1 text-sm text-slate-500">Give it a final look. Use <strong>Back</strong> to change anything.</p>
          {review && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Name" value={review.name || "—"} />
              <Row label="Type" value={premium ? "Premium Recurring" : "Free"} />
              <Row label="Repeats" value={cadence} />
              <Row label="Sessions" value={`up to ${cap || maxSessions}`} />
              <Row label="Ticket" value={`${review.ticket || "—"} · ${Number(review.price) > 0 ? `$${Number(review.price).toFixed(2)}` : "Free"}`} />
              <Row label="All-sessions pass" value={premium && review.bundle ? `$${Number(review.bundle).toFixed(2)}` : "—"} />
            </dl>
          )}
        </section>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => goTo(step - 1)} className="btn-secondary">← Back</button>
        ) : (
          <Link href="/dashboard/events/new" className="btn-secondary">← Change event type</Link>
        )}

        {step < last ? (
          <button type="button" onClick={next} className="btn-primary">Next →</button>
        ) : (
          <button type="submit" className="btn-primary inline-flex items-center gap-1.5">
            <Repeat className="h-4 w-4" aria-hidden /> Create recurring event
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
