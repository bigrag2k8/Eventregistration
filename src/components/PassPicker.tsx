"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { money } from "@/lib/format";

export interface PassOption {
  id: string;
  name: string;
  priceCents: number;
  /** 1-based conference days this pass grants; [] = all days / whole event. */
  dayAccess: number[];
  /** Remaining count, or null when unlimited. */
  left: number | null;
  soldOut: boolean;
}

export interface PassPickerDay {
  index: number;
  label: string; // e.g. "Sat, Aug 15"
}

interface Props {
  passes: PassOption[];
  days: PassPickerDay[];
  presaleActive?: boolean;
  presalePct?: number;
  /**
   * "browse" — public event page: selection carries to /register via the CTA.
   * "checkout" — registration form: reports the selection up via onChange, no CTA.
   */
  mode: "browse" | "checkout";
  /** browse mode only: base /register URL. Undefined disables the CTA (closed). */
  registerHref?: string;
  initialSelected?: string[];
  onChange?: (ids: string[]) => void;
}

/** A pass that grants the whole event (empty dayAccess, or every day, or a 1-day event). */
function coversAllDays(pass: PassOption, dayCount: number): boolean {
  if (dayCount <= 1) return true;
  if (pass.dayAccess.length === 0) return true;
  const inRange = pass.dayAccess.filter((d) => d >= 1 && d <= dayCount);
  return inRange.length >= dayCount;
}

/** Human day-scope for a pass card, e.g. "All 3 days", "Sat, Aug 15", "Days 1 & 3". */
function scopeLabel(pass: PassOption, days: PassPickerDay[]): string {
  const dayCount = days.length;
  if (coversAllDays(pass, dayCount)) return dayCount > 1 ? `All ${dayCount} days` : "Full event";
  const nums = [...pass.dayAccess].filter((d) => d >= 1 && d <= dayCount).sort((a, b) => a - b);
  if (nums.length === 1) {
    const d = days.find((x) => x.index === nums[0]);
    return d ? d.label : `Day ${nums[0]}`;
  }
  return "Days " + nums.join(" & ");
}

const unit = (cents: number, presaleActive?: boolean, presalePct = 0) =>
  presaleActive && cents > 0 ? cents - Math.floor((cents * presalePct) / 100) : cents;

export function PassPicker({
  passes,
  days,
  presaleActive = false,
  presalePct = 0,
  mode,
  registerHref,
  initialSelected,
  onChange,
}: Props) {
  const dayCount = days.length;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [toastDismissed, setToastDismissed] = useState(false);

  // Partition into combinable single-/multi-day passes vs whole-event passes.
  const combinable = useMemo(() => passes.filter((p) => !coversAllDays(p, dayCount)), [passes, dayCount]);
  const allAccessPasses = useMemo(() => passes.filter((p) => coversAllDays(p, dayCount)), [passes, dayCount]);

  // Sum of every combinable (day) pass — the basis for the "Save $X" comparison.
  const combinableSum = useMemo(
    () => combinable.reduce((s, p) => s + unit(p.priceCents, presaleActive, presalePct), 0),
    [combinable, presaleActive, presalePct],
  );
  // Savings for a whole-event pass = day passes' total minus its price (if positive).
  const savingsFor = (pass: PassOption) => {
    if (!combinable.length) return 0;
    const price = unit(pass.priceCents, presaleActive, presalePct);
    return Math.max(0, combinableSum - price);
  };
  // The cheapest all-access pass that beats buying all day passes — the toast target.
  const bestAllAccess = useMemo(() => {
    const withSavings = allAccessPasses
      .filter((p) => !p.soldOut && savingsFor(p) > 0)
      .sort((a, b) => a.priceCents - b.priceCents);
    return withSavings[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAccessPasses, combinableSum]);

  useEffect(() => {
    onChange?.([...selected]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggle(pass: PassOption) {
    if (pass.soldOut) return;
    setToastDismissed(false);
    setSelected((prev) => {
      const next = new Set(prev);
      const isAllAccess = coversAllDays(pass, dayCount);
      if (next.has(pass.id)) {
        next.delete(pass.id);
        return next;
      }
      if (isAllAccess) {
        // Whole-event pass is exclusive — it supersedes everything else.
        return new Set([pass.id]);
      }
      // Selecting a day pass drops any whole-event pass, then adds this day.
      for (const ap of allAccessPasses) next.delete(ap.id);
      next.add(pass.id);
      return next;
    });
  }

  function switchToAllAccess(pass: PassOption) {
    setSelected(new Set([pass.id]));
    setToastDismissed(true);
  }

  const selectedPasses = passes.filter((p) => selected.has(p.id));
  const totalCents = selectedPasses.reduce((s, p) => s + unit(p.priceCents, presaleActive, presalePct), 0);

  // "Save $X with All-Access": fires only when EVERY day pass is selected and a
  // cheaper whole-event pass exists.
  const allDaysSelected = combinable.length > 0 && combinable.every((p) => selected.has(p.id));
  const showToast = !toastDismissed && allDaysSelected && bestAllAccess != null;

  const href =
    mode === "browse" && registerHref && selected.size
      ? `${registerHref}?passes=${[...selected].join(",")}`
      : undefined;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {passes.map((pass) => {
          const isSel = selected.has(pass.id);
          const price = unit(pass.priceCents, presaleActive, presalePct);
          // The "Save $X" badge only makes sense on a whole-event pass (it's the
          // saving vs. buying every day pass separately).
          const save = coversAllDays(pass, dayCount) ? savingsFor(pass) : 0;
          return (
            <button
              key={pass.id}
              type="button"
              onClick={() => toggle(pass)}
              disabled={pass.soldOut}
              aria-pressed={isSel}
              className={`relative flex flex-col rounded-xl border p-4 text-left transition ${
                isSel
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500"
                  : "border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm"
              } ${pass.soldOut ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {save > 0 && !pass.soldOut && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  Save {money(save)}
                </span>
              )}
              <span
                className={`mb-3 flex h-5 w-5 items-center justify-center rounded-md border ${
                  isSel ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white"
                }`}
                aria-hidden
              >
                {isSel && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="text-sm font-semibold text-slate-900">{pass.name}</span>
              <span className="mt-1 text-2xl font-bold text-slate-900">
                {pass.priceCents === 0 ? (
                  "Free"
                ) : presaleActive ? (
                  <>
                    <span className="mr-1 align-middle text-base font-medium text-slate-400 line-through">
                      {money(pass.priceCents)}
                    </span>
                    <span className="align-middle text-emerald-700">{money(price)}</span>
                  </>
                ) : (
                  money(price)
                )}
              </span>
              <span className="mt-1 text-xs font-medium text-brand-700">{scopeLabel(pass, days)}</span>
              <span className="mt-2 text-[11px] text-slate-500">
                {pass.soldOut ? "Sold out" : pass.left !== null ? `${pass.left} left` : "Available"}
              </span>
            </button>
          );
        })}
      </div>

      {showToast && bestAllAccess && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Save <strong>{money(savingsFor(bestAllAccess))}</strong> with the {bestAllAccess.name} — every day for{" "}
              {money(unit(bestAllAccess.priceCents, presaleActive, presalePct))}.
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => switchToAllAccess(bestAllAccess)}
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Switch
            </button>
            <button
              type="button"
              onClick={() => setToastDismissed(true)}
              className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Selection summary + CTA (browse mode) / running total (checkout mode) */}
      <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {selected.size === 0 ? (
            <span className="text-slate-500">Select the pass{combinable.length ? "es" : ""} you want.</span>
          ) : (
            <span className="text-slate-700">
              <span className="font-medium">{selectedPasses.map((p) => p.name).join(" + ")}</span>
              {" — "}
              <span className="font-bold text-slate-900">{totalCents === 0 ? "Free" : money(totalCents)}</span>
              <span className="text-slate-500"> total</span>
            </span>
          )}
        </div>
        {mode === "browse" &&
          (href ? (
            <Link
              href={href}
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition"
              style={{ backgroundColor: "var(--org-brand)" }}
            >
              Register →
            </Link>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-slate-300 px-5 py-2.5 text-sm font-semibold text-white"
              aria-disabled
            >
              {registerHref ? "Select a pass" : "Registration closed"}
            </span>
          ))}
      </div>
    </div>
  );
}
