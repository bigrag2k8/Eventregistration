"use client";

import { Plus, Trash2 } from "lucide-react";

/**
 * One agenda session being built in the wizard. `day` is the 1-based conference
 * day (derived from the Dates step); `startTime`/`endTime` are wall-clock "HH:mm"
 * in the event timezone. The server maps day + time → a real datetime.
 * Serialized to a hidden `sessions` JSON input by ConferenceWizard.
 */
export interface DraftSession {
  title: string;
  description: string;
  track: string;
  room: string;
  speaker: string;
  day: number;
  startTime: string;
  endTime: string;
  capacity: string; // blank = uncapped (open seating)
}

export function newSession(day = 1): DraftSession {
  return { title: "", description: "", track: "", room: "", speaker: "", day, startTime: "09:00", endTime: "10:00", capacity: "" };
}

/**
 * Repeatable agenda editor. Each row is an EventSession. Sessions are grouped by
 * the conference day the organizer assigns them to. Fully controlled by the
 * parent wizard. An empty agenda is allowed — a conference can be published and
 * the agenda filled in later from the Manage page.
 */
export function SessionBuilder({
  value,
  onChange,
  days,
}: {
  value: DraftSession[];
  onChange: (next: DraftSession[]) => void;
  days: { index: number; label: string }[];
}) {
  function update(i: number, patch: Partial<DraftSession>) {
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          No sessions yet. Add your talks, workshops, and breaks — or skip this and build the agenda later from the event&rsquo;s Manage page.
        </p>
      )}

      {value.map((s, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Session {i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </button>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Session title *</label>
              <input
                className="input"
                value={s.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Opening Keynote"
                maxLength={200}
              />
            </div>
            {days.length > 1 && (
              <div>
                <label className="label">Day</label>
                <select className="input" value={s.day} onChange={(e) => update(i, { day: Number(e.target.value) })}>
                  {days.map((d) => (
                    <option key={d.index} value={d.index}>
                      Day {d.index} · {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={days.length > 1 ? "" : "sm:col-span-2"}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start</label>
                  <input type="time" className="input" value={s.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
                </div>
                <div>
                  <label className="label">End</label>
                  <input type="time" className="input" value={s.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
                </div>
              </div>
            </div>
            <div>
              <label className="label">Track</label>
              <input className="input" value={s.track} onChange={(e) => update(i, { track: e.target.value })} placeholder="Main stage" maxLength={120} />
            </div>
            <div>
              <label className="label">Room</label>
              <input className="input" value={s.room} onChange={(e) => update(i, { room: e.target.value })} placeholder="Hall A" maxLength={120} />
            </div>
            <div>
              <label className="label">Speaker</label>
              <input className="input" value={s.speaker} onChange={(e) => update(i, { speaker: e.target.value })} placeholder="Jane Doe" maxLength={200} />
            </div>
            <div>
              <label className="label">Seat cap (blank = open seating)</label>
              <input
                type="number"
                min="1"
                className="input"
                value={s.capacity}
                onChange={(e) => update(i, { capacity: e.target.value })}
                placeholder="e.g. 40"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea
                rows={2}
                className="input"
                value={s.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this session covers…"
                maxLength={2000}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, newSession(days[0]?.index ?? 1)])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add session
      </button>
    </div>
  );
}
