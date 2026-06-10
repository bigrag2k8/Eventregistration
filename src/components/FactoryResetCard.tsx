"use client";

import { useState } from "react";

interface Props {
  keepEmail: string;
  keepOrgName: string | null;
}

export function FactoryResetCard({ keepEmail, keepOrgName }: Props) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; deleted?: any; error?: string } | null>(null);

  const canSubmit = phrase === "WIPE EVERYTHING" && !submitting;

  async function reset() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: phrase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ error: data.error ?? `HTTP ${res.status}` });
      } else {
        setResult({ ok: true, deleted: data.deleted });
        setPhrase("");
        // Refresh the page so the overview counters update
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e: any) {
      setResult({ error: e?.message ?? "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-12 rounded-xl border-2 border-red-300 bg-red-50/50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-red-900">⚠ Danger zone — Factory reset</h2>
          <p className="mt-1 text-sm text-red-900/80">
            Permanently deletes every organization, user, event, registration, ticket, payment,
            vendor application, invite, and audit log on the platform.
          </p>
          <p className="mt-2 text-sm text-red-900/80">
            <strong>Kept:</strong> your SUPERADMIN account ({keepEmail})
            {keepOrgName && <> and your organization (<em>{keepOrgName}</em>) with its branding and Stripe Connect setup</>}.
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Show reset controls
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-red-200 pt-4">
          <label className="block text-sm font-medium text-red-900">
            Type <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono">WIPE EVERYTHING</span> to confirm:
          </label>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="WIPE EVERYTHING"
            className="input font-mono"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={reset}
              disabled={!canSubmit}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Wiping…" : "Wipe all data"}
            </button>
            <button
              onClick={() => { setOpen(false); setPhrase(""); setResult(null); }}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
          </div>

          {result?.error && (
            <p className="rounded bg-red-100 p-3 text-sm text-red-800 ring-1 ring-red-200">
              ⚠ {result.error}
            </p>
          )}

          {result?.ok && (
            <div className="rounded bg-emerald-100 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              ✓ Done. Reloading…
              <ul className="mt-1 list-disc pl-5 text-xs">
                <li>{result.deleted.events} events deleted</li>
                <li>{result.deleted.organizations} organizations deleted</li>
                <li>{result.deleted.users} users deleted</li>
                <li>{result.deleted.pendingInvites} invites deleted</li>
                <li>{result.deleted.auditLogs} audit logs deleted</li>
                <li>{result.deleted.sessions} sessions deleted</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
