"use client";

import Link from "next/link";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { useChangeFormat } from "@/components/EventFormatGate";

/**
 * Presentation-only multi-step wrapper for the create-event form. It does NOT
 * change what gets submitted: every field stays mounted (steps are hidden via
 * the `hidden` attribute, not unmounted), so the FormData posted to
 * createEventAction is identical to the old single-page form. All this adds is
 * progressive disclosure + per-step validation + a review step.
 *
 * `children` = one node per INPUT step, in order. The final "Review" step is
 * rendered by the wizard itself (reads the form back), so `titles` has one more
 * entry than there are children.
 */
interface Props {
  titles: string[];
  children: ReactNode;
}

interface ReviewData {
  name: string;
  tier: string;
  start: string;
  end: string;
  timezone: string;
  isVirtual: boolean;
  venue: string;
  city: string;
  virtualUrl: string;
  ticketName: string;
  price: string;
  isPrivate: boolean;
}

function fmtDateTime(v: string): string {
  if (!v) return "—";
  // datetime-local value is "YYYY-MM-DDTHH:mm" wall-clock; render readably
  // without timezone math (the tz is shown separately).
  const [d, t] = v.split("T");
  if (!d) return v;
  const [y, mo, da] = d.split("-");
  return `${mo}/${da}/${y}${t ? ` ${t}` : ""}`;
}

export function EventWizard({ titles, children }: Props) {
  const steps = Children.toArray(children);
  const inputStepCount = steps.length; // review is the extra last step
  const last = titles.length - 1; // index of the Review step
  const changeType = useChangeFormat();
  const [step, setStep] = useState(0);
  const [review, setReview] = useState<ReviewData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function form(): HTMLFormElement | null {
    return rootRef.current?.closest("form") ?? null;
  }

  // Validate only the fields in the currently-visible step before advancing.
  function validateStep(index: number): boolean {
    const container = rootRef.current?.querySelectorAll<HTMLElement>("[data-wizard-step]")[index];
    if (!container) return true;
    const fields = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    );
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
    if (step < inputStepCount && !validateStep(step)) return;
    goTo(Math.min(step + 1, last));
  }

  // When we land on the review step, read the current form values back.
  useEffect(() => {
    if (step !== last) return;
    const f = form();
    if (!f) return;
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const checked = (n: string) => {
      const el = f.elements.namedItem(n) as RadioNodeList | HTMLInputElement | null;
      if (el && "checked" in el) return (el as HTMLInputElement).checked;
      return false;
    };
    const tierEl = f.elements.namedItem("tier") as RadioNodeList | null;
    setReview({
      name: val("name"),
      tier: (tierEl?.value as string) === "single_event" ? "Premium Event" : "Free event",
      start: val("startAt"),
      end: val("endAt"),
      timezone: val("timezone"),
      isVirtual: checked("isVirtual"),
      venue: val("venueName"),
      city: val("city"),
      virtualUrl: val("virtualUrl"),
      ticketName: val("ticketName"),
      price: val("ticketPrice"),
      isPrivate: checked("isPrivate"),
    });
  }, [step, last]);

  return (
    <div ref={rootRef}>
      {/* Stepper */}
      <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {titles.map((t, i) => {
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
                    active
                      ? "bg-brand-600 text-white"
                      : done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400"}>
                  {t}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Input steps — all mounted, only the current one visible. */}
      {steps.map((child, i) => (
        <div key={i} data-wizard-step hidden={i !== step}>
          {child}
        </div>
      ))}

      {/* Review step (rendered by the wizard) */}
      <div data-wizard-step hidden={step !== last}>
        <section className="card">
          <h2 className="text-lg font-semibold">Review &amp; publish</h2>
          <p className="mt-1 text-sm text-slate-500">
            Give it a final look. Use <strong>Back</strong> to change anything — or save as a draft and finish later.
          </p>
          {review && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Event name" value={review.name || "—"} />
              <Row label="Type" value={review.tier} />
              <Row label="Starts" value={`${fmtDateTime(review.start)} ${review.timezone}`} />
              <Row label="Ends" value={`${fmtDateTime(review.end)} ${review.timezone}`} />
              <Row
                label="Location"
                value={review.isVirtual ? `Virtual${review.virtualUrl ? ` · ${review.virtualUrl}` : ""}` : [review.venue, review.city].filter(Boolean).join(", ") || "—"}
              />
              <Row
                label="First ticket"
                value={`${review.ticketName || "—"} · ${Number(review.price) > 0 ? `$${Number(review.price).toFixed(2)}` : "Free"}`}
              />
              <Row label="Visibility" value={review.isPrivate ? "Private (link only)" : "Public"} />
            </dl>
          )}
        </section>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => goTo(step - 1)} className="btn-secondary">
            ← Back
          </button>
        ) : changeType ? (
          <button type="button" onClick={changeType} className="btn-secondary">
            ← Change event type
          </button>
        ) : (
          <Link href="/dashboard" className="btn-secondary">
            Cancel
          </Link>
        )}

        {step < last ? (
          <button type="button" onClick={next} className="btn-primary">
            Next →
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="submit" name="action" value="draft" className="btn-secondary">
              Save as draft
            </button>
            <button type="submit" name="action" value="publish" className="btn-primary">
              Save &amp; publish
            </button>
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
