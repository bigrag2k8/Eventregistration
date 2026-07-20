"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { BannerImageInput } from "@/components/BannerImageInput";
import { EventTypePicker, CapacityField, VendorSettingsFields, useEventTier } from "@/components/EventTierForm";
import { PassBuilder, newPass, type DraftPass } from "@/components/PassBuilder";
import { SessionBuilder, type DraftSession } from "@/components/SessionBuilder";
import { EVENT_CATEGORIES } from "@/lib/categories";

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC",
];

const TITLES = ["Type", "Basics", "Dates", "Location", "Passes", "Agenda", "Settings", "Review"];

/** Conference days derived from the two wall-clock date strings. Timezone-agnostic
 *  (the wall-clock date IS the local date), matching the server's derivation. UI
 *  caps at 14 days so a fat-fingered range can't render a huge list; the server
 *  still enforces the real 1/7-day span limits. */
function daysFrom(start: string, end: string): { index: number; label: string }[] {
  const sd = start.slice(0, 10);
  const ed = end.slice(0, 10);
  if (!sd || !ed) return [{ index: 1, label: "" }];
  let s: Date, e: Date;
  try {
    s = parseISO(sd);
    e = parseISO(ed);
  } catch {
    return [{ index: 1, label: "" }];
  }
  const n = Math.max(1, Math.min(14, differenceInCalendarDays(e, s) + 1));
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(s, i);
    return { index: i + 1, label: format(d, "EEE, MMM d") };
  });
}

interface Props {
  credits: number;
  chargesEnabled: boolean;
  defaultStart: string;
  defaultEnd: string;
}

export function ConferenceWizard({ credits, chargesEnabled, defaultStart, defaultEnd }: Props) {
  const { tier } = useEventTier();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [passes, setPasses] = useState<DraftPass[]>([{ ...newPass(), name: "General Admission" }]);
  const [sessions, setSessions] = useState<DraftSession[]>([]);
  const [review, setReview] = useState<{ name: string; venue: string; city: string; virtualUrl: string; isVirtual: boolean; isPrivate: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const last = TITLES.length - 1;
  const days = daysFrom(start, end);
  const premium = tier === "single_event";
  const dayScoping = premium && days.length > 1;
  const freeMultiDay = !premium && days.length > 1;

  // Keep session day assignments inside the current span if the range shrinks.
  useEffect(() => {
    setSessions((prev) => {
      const max = days.length;
      let changed = false;
      const next = prev.map((s) => {
        if (s.day > max) {
          changed = true;
          return { ...s, day: max };
        }
        return s;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

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
    const checked = (n: string) => {
      const el = f.elements.namedItem(n) as HTMLInputElement | null;
      return !!(el && "checked" in el && el.checked);
    };
    setReview({
      name: val("name"),
      venue: val("venueName"),
      city: val("city"),
      virtualUrl: val("virtualUrl"),
      isVirtual: checked("isVirtual"),
      isPrivate: checked("isPrivate"),
    });
  }, [step, last]);

  const dayLabel = (ds: number[]) => {
    if (ds.length === 0 || ds.length === days.length) return "All days";
    return "Day " + [...ds].sort((a, b) => a - b).join(", ");
  };

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
        <div className="space-y-6">
          <EventTypePicker credits={credits} premiumLabel="Premium Conference" returnTo="/dashboard/events/new?format=conference&bought=SINGLE_EVENT" />
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200">
            <strong>Free</strong> hosts a single-day conference (up to 50 registrations). <strong>Premium Conference</strong> unlocks a
            multi-day conference (up to 7 days), day passes (Day 1 / Day 2 / All-Access), and unlimited registrations.
          </div>
        </div>
      </div>

      {/* 2. Basics */}
      <div data-wizard-step hidden={step !== 1}>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-lg font-semibold">Basics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Conference name *</label>
                <input name="name" required maxLength={200} className="input" placeholder="AI Summit 2026" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Short description (1 line)</label>
                <input name="shortDescription" maxLength={160} className="input" placeholder="Three days of talks, workshops, and networking" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Full description *</label>
                <textarea name="description" required rows={5} className="input" placeholder="Tell attendees what to expect…" />
              </div>
              <div>
                <label className="label">Category</label>
                <select name="category" className="input">
                  <option value="">— Pick one —</option>
                  {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tags (comma-separated)</label>
                <input name="tags" className="input" placeholder="ai, conference, 2026" />
              </div>
              <div className="sm:col-span-2">
                <BannerImageInput />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 3. Dates */}
      <div data-wizard-step hidden={step !== 2}>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-lg font-semibold">Dates</h2>
            <p className="mt-1 text-sm text-slate-500">A conference can span multiple calendar days. Days are worked out in your timezone.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Start *</label>
                <input name="startAt" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">End *</label>
                <input name="endAt" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Timezone</label>
                <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
                <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
                This conference spans <strong>{days.length}</strong> {days.length === 1 ? "day" : "days"}
                {days.length > 1 ? ` · ${days[0].label} → ${days[days.length - 1].label}` : ""}.
              </div>
              {freeMultiDay && (
                <div className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  A <strong>Free</strong> conference runs for a single day. To keep these dates, choose <strong>Premium Conference</strong> back
                  on the <strong>Type</strong> step (up to 7 days + day passes) — otherwise shorten the range to one day.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 4. Location */}
      <div data-wizard-step hidden={step !== 3}>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-lg font-semibold">Where</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isVirtual" value="1" />
                  This is a virtual conference
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Venue name</label>
                <input name="venueName" className="input" placeholder="Moscone Center" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Address line 1</label>
                <input name="addressLine1" className="input" placeholder="747 Howard St" />
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
                <label className="label">Virtual URL (for virtual conferences)</label>
                <input name="virtualUrl" type="url" className="input" placeholder="https://zoom.us/j/..." />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 5. Passes */}
      <div data-wizard-step hidden={step !== 4}>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-lg font-semibold">Passes</h2>
            <p className="mt-1 text-sm text-slate-500">
              {dayScoping
                ? "Sell a single all-access pass, or scope passes to specific days (Day 1 / Day 2 / All-Access)."
                : "What attendees buy to get in. You can add more tiers later from the Manage page."}
            </p>
            <div className="mt-4">
              <PassBuilder value={passes} onChange={setPasses} days={days} dayScoping={dayScoping} chargesEnabled={chargesEnabled} />
            </div>
          </section>
        </div>
      </div>

      {/* 6. Agenda */}
      <div data-wizard-step hidden={step !== 5}>
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-lg font-semibold">Agenda</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add your sessions{days.length > 1 ? ", assigning each to a day" : ""}. Give a session a seat cap to make it reservable with a
              waitlist; leave it blank for open seating. You can also skip this and build the agenda later.
            </p>
            <div className="mt-4">
              <SessionBuilder value={sessions} onChange={setSessions} days={days} />
            </div>
          </section>
        </div>
      </div>

      {/* 7. Settings */}
      <div data-wizard-step hidden={step !== 6}>
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
                <textarea name="refundPolicy" rows={2} className="input" placeholder="Refunds available up to 14 days before the conference." />
              </div>
              <div className="sm:col-span-2 border-t pt-4">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="isPrivate" value="1" className="mt-1" />
                  <span>
                    <span className="font-bold">Make this conference private</span>
                    <br />
                    <span className="text-xs text-slate-500">Hides it from yourevents.app and your public org page. People can still register with the direct link.</span>
                  </span>
                </label>
              </div>
              <VendorSettingsFields />
            </div>
          </section>
        </div>
      </div>

      {/* 8. Review */}
      <div data-wizard-step hidden={step !== last}>
        <section className="card">
          <h2 className="text-lg font-semibold">Review &amp; publish</h2>
          <p className="mt-1 text-sm text-slate-500">Give it a final look. Use <strong>Back</strong> to change anything — or save as a draft and finish later.</p>
          {review && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Conference name" value={review.name || "—"} />
              <Row label="Type" value={premium ? "Premium Event" : "Free"} />
              <Row label="Span" value={`${days.length} ${days.length === 1 ? "day" : "days"}${days.length > 1 ? ` · ${days[0].label} → ${days[days.length - 1].label}` : ""}`} />
              <Row label="Timezone" value={timezone} />
              <Row label="Location" value={review.isVirtual ? `Virtual${review.virtualUrl ? ` · ${review.virtualUrl}` : ""}` : [review.venue, review.city].filter(Boolean).join(", ") || "—"} />
              <Row label="Visibility" value={review.isPrivate ? "Private (link only)" : "Public"} />
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Passes ({passes.length})</dt>
                <dd className="mt-1 space-y-1 text-sm font-medium text-slate-800">
                  {passes.map((p, i) => (
                    <div key={i} className="flex flex-wrap gap-x-2">
                      <span>{p.name || `Pass ${i + 1}`}</span>
                      <span className="text-slate-400">·</span>
                      <span>{Number(p.price) > 0 ? `$${Number(p.price).toFixed(2)}` : "Free"}</span>
                      {dayScoping && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{dayLabel(p.days)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Agenda</dt>
                <dd className="mt-1 text-sm font-medium text-slate-800">
                  {sessions.length === 0 ? "No sessions yet (add them later)" : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
                </dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      {/* Serialized builder state — the only pass/session data that posts. */}
      <input type="hidden" name="passes" value={JSON.stringify(passes)} />
      <input type="hidden" name="sessions" value={JSON.stringify(sessions)} />

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
          <div className="flex gap-2">
            <button type="submit" name="action" value="draft" className="btn-secondary">Save as draft</button>
            <button type="submit" name="action" value="publish" className="btn-primary">Save &amp; publish</button>
          </div>
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
