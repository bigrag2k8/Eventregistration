"use client";

import { useState } from "react";

export function VendorCheckoutForm({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/vendors/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't start checkout.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.status === "PAID") {
        window.location.reload();
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
      <button onClick={pay} disabled={submitting} className="btn-primary mt-6 w-full">
        {submitting ? "Loading…" : "Pay & confirm booth"}
      </button>
    </>
  );
}
