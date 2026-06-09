"use client";

import { useState } from "react";

export function BillingActions({ currentPlan, hasStripeSubscription }: {
  currentPlan: string;
  hasStripeSubscription: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Could not open billing portal.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!hasStripeSubscription || currentPlan === "FREE") return null;

  return (
    <button type="button" onClick={openPortal} disabled={loading} className="btn-secondary">
      {loading ? "Opening…" : "Manage billing →"}
    </button>
  );
}
