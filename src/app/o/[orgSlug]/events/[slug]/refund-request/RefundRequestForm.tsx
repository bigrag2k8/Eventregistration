"use client";

import { useState } from "react";

interface Props {
  registrationId: string;
  accessKey: string;
}

export function RefundRequestForm({ registrationId, accessKey }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/refund-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, key: accessKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <strong>Request submitted</strong>
        <p className="mt-1">
          The organizer has been notified and will review your request. You'll receive an email
          once a decision is made.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      <div>
        <label className="label">Why are you requesting a refund? *</label>
        <textarea
          required
          minLength={10}
          rows={4}
          className="input"
          placeholder="Please describe your reason for requesting a refund..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          The 4.5% processing fee is non-refundable per the event's refund policy.
        </p>
      </div>
      <button type="submit" disabled={submitting || reason.length < 10} className="btn-primary w-full">
        {submitting ? "Submitting..." : "Submit refund request"}
      </button>
    </form>
  );
}
