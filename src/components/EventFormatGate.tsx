"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";

type Format = "standard" | "conference";

/**
 * Front door for the create-event flow. First asks WHAT the organizer is
 * creating — a Standard event or a Conference — then mounts the matching wizard.
 * The two wizards are entirely independent forms (different fields, different
 * server actions), so a Conference is set up without ever touching the standard
 * single-event path. `initialFormat` lets the page skip the chooser when we
 * arrive back mid-flow (e.g. ?format=conference after buying a credit).
 */
export function EventFormatGate({
  standard,
  conference,
  initialFormat = null,
}: {
  standard: ReactNode;
  conference: ReactNode;
  initialFormat?: Format | null;
}) {
  const [format, setFormat] = useState<Format | null>(initialFormat);

  if (format === null) {
    return (
      <div>
        <h2 className="text-lg font-semibold">What are you creating?</h2>
        <p className="mt-1 text-sm text-slate-500">You&rsquo;ll choose Free or paid on the next step.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          Creating a <strong className="text-slate-700">{format === "conference" ? "conference" : "standard event"}</strong>
        </span>
        <button type="button" onClick={() => setFormat(null)} className="text-sm text-brand-700 hover:underline">
          ← Change event type
        </button>
      </div>
      {format === "conference" ? conference : standard}
    </div>
  );
}
