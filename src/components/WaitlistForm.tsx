"use client";

import { useState } from "react";

interface Props {
  eventId: string;
}

export function WaitlistForm({ eventId }: Props) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [leaveToken, setLeaveToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.position) {
          setPosition(data.position);
        } else {
          setError(typeof data.error === "string" ? data.error : "Something went wrong.");
        }
        return;
      }
      setPosition(data.position);
      if (data.leaveToken) setLeaveToken(data.leaveToken);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (position !== null) {
    return (
      <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-center text-sm text-emerald-800 ring-1 ring-emerald-200">
        <div className="text-lg font-bold">You're on the waitlist!</div>
        <p className="mt-1">Position: <strong>#{position}</strong></p>
        <p className="mt-1 text-xs text-emerald-600">
          We'll email you at <strong>{form.email}</strong> when a spot opens up.
        </p>
        {leaveToken && (
          <p className="mt-3 text-xs text-emerald-700">
            <a href={`/waitlist/leave/${leaveToken}`} className="underline">
              Leave the waitlist
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-red-200">{error}</div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="First name"
          className="input text-sm"
          value={form.firstName}
          onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
        />
        <input
          required
          placeholder="Last name"
          className="input text-sm"
          value={form.lastName}
          onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
        />
      </div>
      <input
        required
        type="email"
        placeholder="Email address"
        className="input text-sm"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      />
      <button type="submit" disabled={submitting} className="btn-primary w-full text-sm">
        {submitting ? "Joining..." : "Join waitlist"}
      </button>
    </form>
  );
}
