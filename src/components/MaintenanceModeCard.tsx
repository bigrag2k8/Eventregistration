"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  active: boolean;
  message: string | null;
  until: string | null; // ISO
  startedAt: string | null; // ISO
}

const PRESETS: { label: string; minutes: number | null }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "No end time", minutes: null },
];

/**
 * Admin toggle for platform maintenance mode. When the platform is healthy this
 * shows the "Start maintenance" controls (message + duration); when active it
 * flips to a red banner with the current window and an "End maintenance"
 * button. SUPERADMINs bypass maintenance everywhere so they always reach this
 * card to turn it off.
 */
export function MaintenanceModeCard({ active, message, until, startedAt }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftMinutes, setDraftMinutes] = useState<number | null>(60);

  async function start() {
    setSubmitting(true); setError(null);
    try {
      const untilIso = draftMinutes ? new Date(Date.now() + draftMinutes * 60_000).toISOString() : null;
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", message: draftMessage || undefined, until: untilIso }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function stop() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (active) {
    return (
      <div className="mt-8 rounded-xl border-2 border-red-300 bg-red-50/50 p-6">
        <h2 className="text-lg font-bold text-red-900">⏸ Maintenance mode is ACTIVE</h2>
        <p className="mt-2 text-sm text-red-900/80">
          Every non-SUPERADMIN visitor sees the maintenance page. Sign-ins for everyone except SUPERADMINs are blocked.
          You can continue using the site normally.
        </p>
        <dl className="mt-4 grid gap-2 text-sm text-red-900/80 sm:grid-cols-2">
          {startedAt && <div><strong>Started:</strong> {new Date(startedAt).toLocaleString()}</div>}
          {until ? (
            <div><strong>Ends:</strong> {new Date(until).toLocaleString()}</div>
          ) : (
            <div><strong>Ends:</strong> when you click below</div>
          )}
          {message && <div className="sm:col-span-2"><strong>Message:</strong> <span className="italic">{message}</span></div>}
        </dl>
        <button
          onClick={stop}
          disabled={submitting}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {submitting ? "Ending…" : "End maintenance now"}
        </button>
        {error && <p className="mt-3 text-sm text-red-700">⚠ {error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl bg-white p-6 ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">Maintenance mode</h2>
      <p className="mt-1 text-sm text-slate-500">
        Take the site down for everyone except SUPERADMINs. Useful for planned upgrades, database
        migrations, or anything that risks a partial-state outage. SUPERADMINs always retain access.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-4 btn-secondary">
          Start maintenance…
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Message (optional)</label>
            <input
              type="text"
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              placeholder="Default: 'We'll be back shortly. Thanks for your patience.'"
              maxLength={500}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">Shown on the maintenance page. Keep it short.</p>
          </div>

          <div>
            <label className="label">Duration</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDraftMinutes(p.minutes)}
                  className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${
                    draftMinutes === p.minutes
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {draftMinutes
                ? `Auto-expires in about ${draftMinutes} minutes. You can end it earlier.`
                : "Stays on until you manually end it."}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={start}
              disabled={submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {submitting ? "Starting…" : "Start maintenance now"}
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-red-700">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
