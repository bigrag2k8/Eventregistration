"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * "Buy the all-sessions pass" form on the public series page. Collects the minimum
 * (name/email/phone), then hands off to Stripe Checkout for the bundle total.
 */
export function BundleCheckoutForm({ seriesId, brand }: { seriesId: string; brand?: string | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/series/bundle-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId,
          firstName: fd.get("firstName"),
          lastName: fd.get("lastName"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(typeof data.error === "string" ? data.error : "Couldn't start checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url; // Stripe Checkout
    } catch {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bf-first">First name *</label>
          <input id="bf-first" name="firstName" autoComplete="given-name" required maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="bf-last">Last name *</label>
          <input id="bf-last" name="lastName" autoComplete="family-name" required maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="bf-email">Email *</label>
          <input id="bf-email" name="email" type="email" autoComplete="email" required maxLength={200} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="bf-phone">Phone</label>
          <input id="bf-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} className="input" />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full disabled:opacity-60"
        style={brand ? { backgroundColor: brand } : undefined}
      >
        {submitting ? "Starting checkout…" : "Buy the all-sessions pass"}
      </button>
    </form>
  );
}
