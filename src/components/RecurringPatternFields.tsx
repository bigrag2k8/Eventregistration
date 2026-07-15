"use client";

import { useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byWeekday: number[];
  monthlyMode: "DAY_OF_MONTH" | "NTH_WEEKDAY" | null;
  startDate: string; // yyyy-MM-dd in the recurring event's timezone
  startTime: string; // HH:mm
  durationMinutes: number;
}

/**
 * The repeat-pattern inputs, pre-filled from the current rule. Same shape as the
 * create form's "When it repeats" section — kept as its own component because
 * the pattern editor is a separate, heavier operation than the rest of editing.
 */
export function RecurringPatternFields(props: Props) {
  const [frequency, setFrequency] = useState<Props["frequency"]>(props.frequency);
  const [days, setDays] = useState<Set<number>>(new Set(props.byWeekday));
  const intervalUnit = frequency === "DAILY" ? "day(s)" : frequency === "WEEKLY" ? "week(s)" : "month(s)";

  function toggleDay(n: number) {
    setDays((s) => {
      const x = new Set(s);
      x.has(n) ? x.delete(n) : x.add(n);
      return x;
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-freq">Repeats *</label>
          <select
            id="p-freq"
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Props["frequency"])}
            className="input"
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-interval">Every</label>
          <div className="flex items-center gap-2">
            <input id="p-interval" name="interval" type="number" min={1} max={52} defaultValue={props.interval} className="input w-24" />
            <span className="text-sm text-slate-600">{intervalUnit}</span>
          </div>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div>
          <span className="label">On these days *</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => (
              <label
                key={i}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ${
                  days.has(i) ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-slate-600 ring-slate-200"
                }`}
              >
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
              <input type="radio" name="monthlyMode" value="DAY_OF_MONTH" defaultChecked={props.monthlyMode !== "NTH_WEEKDAY"} />
              Same day of the month (e.g. the 15th)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="monthlyMode" value="NTH_WEEKDAY" defaultChecked={props.monthlyMode === "NTH_WEEKDAY"} />
              Same weekday (e.g. the 2nd Tuesday)
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">The pattern is taken from the new start date below.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="p-start">New pattern starts *</label>
          <input id="p-start" name="startDate" type="date" required defaultValue={props.startDate} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="p-time">Start time *</label>
          <input id="p-time" name="startTime" type="time" required defaultValue={props.startTime} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="p-dur">Length (minutes) *</label>
          <input id="p-dur" name="durationMinutes" type="number" min={5} max={1440} required defaultValue={props.durationMinutes} className="input" />
        </div>
      </div>
    </div>
  );
}
