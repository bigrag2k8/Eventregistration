"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CalendarDays, CalendarRange, Repeat } from "lucide-react";

type Format = "standard" | "recurring" | "conference";

const LABELS: Record<Format, string> = {
  standard: "standard event",
  recurring: "recurring event",
  conference: "conference",
};

/**
 * Lets any wizard mounted inside the gate send the organizer back to the format
 * chooser (its "← Change event type" control). Null when a wizard is rendered
 * outside a gate, so those controls can fall back to a plain link.
 */
const ChangeFormatContext = createContext<(() => void) | null>(null);
export function useChangeFormat() {
  return useContext(ChangeFormatContext);
}

/**
 * Front door for the create-event flow. First asks WHAT the organizer is
 * creating — a Standard event, a Recurring event, or a Conference — then mounts
 * the matching wizard. Each wizard is an entirely independent form (different
 * fields, different server actions), so the formats never touch each other's
 * paths. `initialFormat` lets the page skip the chooser when we arrive back
 * mid-flow (e.g. ?format=recurring after buying a credit).
 */
export function EventFormatGate({
  standard,
  recurring,
  conference,
  initialFormat = null,
}: {
  standard: ReactNode;
  recurring: ReactNode;
  conference: ReactNode;
  initialFormat?: Format | null;
}) {
  const [format, setFormat] = useState<Format | null>(initialFormat);
  const changeType = () => setFormat(null);

  if (format === null) {
    return (
      <div>
        <h2 className="text-lg font-semibold">What are you creating?</h2>
        <p className="mt-1 text-sm text-slate-500">You&rsquo;ll choose Free or paid on the next step.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setFormat("standard")}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-5 text-left hover:border-brand-300 hover:ring-2 hover:ring-brand-100"
          >
            <CalendarDays className="h-6 w-6 text-brand-600" aria-hidden />
            <span className="mt-3 font-semibold">Standard event</span>
            <span className="mt-1 text-sm text-slate-500">
              A single gathering — a talk, class, party, mixer, or meetup. One date, one set of tickets.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFormat("recurring")}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-5 text-left hover:border-brand-300 hover:ring-2 hover:ring-brand-100"
          >
            <Repeat className="h-6 w-6 text-brand-600" aria-hidden />
            <span className="mt-3 font-semibold">Recurring event</span>
            <span className="mt-1 text-sm text-slate-500">
              Repeats on a schedule (weekly class, monthly meetup). Each date is its own registerable session.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFormat("conference")}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-5 text-left hover:border-brand-300 hover:ring-2 hover:ring-brand-100"
          >
            <CalendarRange className="h-6 w-6 text-brand-600" aria-hidden />
            <span className="mt-3 font-semibold">Conference</span>
            <span className="mt-1 text-sm text-slate-500">
              A multi-day program with an agenda of sessions and day passes (Day 1 / Day 2 / All-Access). Premium for 2+ days.
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <ChangeFormatContext.Provider value={changeType}>
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            Creating a <strong className="text-slate-700">{LABELS[format]}</strong>
          </span>
          <button type="button" onClick={changeType} className="text-sm text-brand-700 hover:underline">
            ← Change event type
          </button>
        </div>
        {format === "conference" ? conference : format === "recurring" ? recurring : standard}
      </div>
    </ChangeFormatContext.Provider>
  );
}
