"use client";

import { Plus, Trash2 } from "lucide-react";

/**
 * A conference day pass being built in the wizard. `days` is the set of 1-based
 * conference days this pass grants (empty = the whole conference / All-Access).
 * Serialized to a hidden `passes` JSON input by ConferenceWizard.
 */
export interface DraftPass {
  name: string;
  price: string; // dollars, as typed
  days: number[];
}

export function newPass(): DraftPass {
  return { name: "", price: "0", days: [] };
}

/**
 * Repeatable day-pass editor. Each row is a ticket tier the attendee can buy.
 * When the conference spans multiple days AND is premium, each pass can be
 * scoped to specific days (a "Day 2 Pass"); otherwise every pass covers the whole
 * event (days = [], stored as All-Access). Fully controlled by the parent wizard.
 */
export function PassBuilder({
  value,
  onChange,
  days,
  dayScoping,
  chargesEnabled,
}: {
  value: DraftPass[];
  onChange: (next: DraftPass[]) => void;
  days: { index: number; label: string }[];
  dayScoping: boolean;
  chargesEnabled: boolean;
}) {
  function update(i: number, patch: Partial<DraftPass>) {
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function toggleDay(i: number, day: number) {
    const cur = value[i].days;
    update(i, { days: cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b) });
  }

  return (
    <div className="space-y-4">
      {value.map((pass, i) => {
        const needsConnect = !chargesEnabled && Number(pass.price) > 0;
        return (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold text-slate-700">Pass {i + 1}</span>
              {value.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Pass name *</label>
                <input
                  className="input"
                  value={pass.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder={dayScoping ? "Day 1 Pass" : "General Admission"}
                  maxLength={120}
                />
              </div>
              <div>
                {needsConnect && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong>Payouts not set up.</strong> Charging for passes needs Stripe Connect.{" "}
                    <a href="/dashboard/settings#payouts" className="font-medium underline hover:text-amber-950">
                      Connect Stripe →
                    </a>
                  </div>
                )}
                <label className="label">Price (USD) — 0 for free</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={pass.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                />
              </div>
            </div>

            {dayScoping && (
              <div className="mt-3">
                <span className="label">Day access</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {days.map((d) => {
                    const on = pass.days.includes(d.index);
                    return (
                      <button
                        key={d.index}
                        type="button"
                        onClick={() => toggleDay(i, d.index)}
                        className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                          on ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-slate-600 ring-slate-200 hover:ring-brand-200"
                        }`}
                      >
                        Day {d.index}
                        <span className="ml-1 text-xs text-slate-400">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {pass.days.length === 0
                    ? "Covers all days (an All-Access pass) — leave blank for the full conference."
                    : `Covers day ${[...pass.days].sort((a, b) => a - b).join(", ")} only.`}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...value, newPass()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add another pass
      </button>
    </div>
  );
}
