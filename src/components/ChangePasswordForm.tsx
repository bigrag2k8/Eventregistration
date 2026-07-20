"use client";

import { useState } from "react";

/**
 * In-account "Change password" for signed-in organizers/staff. Posts to
 * /api/auth/change-password (which verifies the current password, rotates the
 * hash, revokes other sessions, and refreshes this one) and shows inline
 * feedback — no navigation, matching the forgot-password page's fetch pattern.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't change your password. Please try again.");
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      {done && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <strong>Password changed.</strong> Any other devices signed in to this account have been signed out.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">⚠ {error}</div>
      )}

      <div>
        <label className="label" htmlFor="cp-current">Current password</label>
        <input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="cp-new">New password</label>
        <input
          id="cp-new"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="cp-confirm">Confirm new password</label>
        <input
          id="cp-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
