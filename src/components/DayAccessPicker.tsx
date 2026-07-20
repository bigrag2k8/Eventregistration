"use client";

import { useState } from "react";

/**
 * Day-scoped ticket access picker. Renders one pill per conference day; checked
 * days become the ticket's `dayAccess`. Leaving ALL unchecked = the whole event
 * (an All-Access pass) — the server treats an empty dayAccess as "all days".
 * Submitted as repeated `dayAccess` form values (read server-side via getAll).
 */
export function DayAccessPicker({ days }: { days: { index: number; label: string }[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (n: number) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  return (
    <div>
      <span className="label">Day access</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {days.map((d) => {
          const on = selected.has(d.index);
          return (
            <label
              key={d.index}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ${
                on ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-slate-600 ring-slate-200"
              }`}
            >
              <input
                type="checkbox"
                name="dayAccess"
                value={d.index}
                checked={on}
                onChange={() => toggle(d.index)}
                className="sr-only"
              />
              Day {d.index}
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {selected.size === 0
          ? "All days (an All-Access pass) — leave blank for a full-conference ticket."
          : `Covers day ${[...selected].sort((a, b) => a - b).join(", ")} only.`}
      </p>
    </div>
  );
}
