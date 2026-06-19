"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Props {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export function ConnectActions({ hasAccount, chargesEnabled, payoutsEnabled, detailsSubmitted }: Props) {
  const search = useSearchParams();
  const [loadingOnboard, setLoadingOnboard] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user just returned from Stripe onboarding, auto-sync account status.
  // When onboarding ran in a popup (the common case now), Stripe's redirect
  // lands in that popup. We refresh the OPENER (the original dashboard tab) so
  // its status updates, then close the popup. When it's the only tab — popup
  // blocker fired and onboarding ran in-place — we just reload self.
  useEffect(() => {
    if (search.get("connect") === "return" && hasAccount) {
      setRefreshing(true);
      fetch("/api/billing/connect/dashboard").then(() => {
        if (window.opener && !window.opener.closed) {
          try { window.opener.location.reload(); } catch {}
          window.close();
        } else {
          window.location.replace(window.location.pathname);
        }
      }).catch(() => setRefreshing(false));
    }
  }, [search, hasAccount]);

  // Popup-blocker note: window.open() called AFTER an async fetch is treated as
  // non-user-initiated and blocked by most browsers. The pattern below opens a
  // placeholder window synchronously inside the click handler, then navigates
  // it once the Stripe URL arrives. If even the placeholder was blocked we
  // fall back to a same-tab navigation so the user is never stuck.

  async function startOnboard() {
    setLoadingOnboard(true); setError(null);
    const popup = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/billing/connect/onboard", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        if (popup) { popup.location.href = data.url; popup.focus(); }
        else { window.location.href = data.url; } // popup blocked → in-place
      } else {
        if (popup) popup.close();
        setError(data.error ?? "Couldn't open Stripe onboarding.");
      }
    } finally {
      setLoadingOnboard(false);
    }
  }

  async function openDashboard() {
    setLoadingDashboard(true); setError(null);
    const popup = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/billing/connect/dashboard", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        if (popup) { popup.location.href = data.url; popup.focus(); }
        else { window.location.href = data.url; }
      } else {
        if (popup) popup.close();
        setError(data.error ?? "Couldn't open Stripe dashboard.");
      }
    } finally {
      setLoadingDashboard(false);
    }
  }

  if (refreshing) {
    return <p className="text-sm text-slate-500">Syncing Stripe account status…</p>;
  }

  if (!hasAccount) {
    return (
      <div className="space-y-3">
        <button onClick={startOnboard} disabled={loadingOnboard} className="btn-primary">
          {loadingOnboard ? "Opening Stripe…" : "Connect with Stripe"}
        </button>
        <p className="text-xs text-slate-500">
          You'll be taken to Stripe's hosted onboarding form (~5 min). You'll need your business info, EIN/SSN, and bank account details.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  const fullyReady = chargesEnabled && payoutsEnabled;
  const status = fullyReady ? "verified" : detailsSubmitted ? "pending" : "incomplete";

  return (
    <div className="space-y-3">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ${
        fullyReady ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : status === "pending" ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-50 text-slate-700 ring-slate-200"
      }`}>
        {fullyReady ? "✓ Verified — ready to accept payments" :
         status === "pending" ? "⏳ Pending verification (Stripe is reviewing)" :
         "⚠ Onboarding incomplete — finish setup below"}
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className={`rounded ring-1 p-2 ${chargesEnabled ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200"}`}>
          <strong>Accept payments:</strong> {chargesEnabled ? "✓ Yes" : "Not yet"}
        </div>
        <div className={`rounded ring-1 p-2 ${payoutsEnabled ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200"}`}>
          <strong>Receive payouts:</strong> {payoutsEnabled ? "✓ Yes" : "Not yet"}
        </div>
        <div className={`rounded ring-1 p-2 ${detailsSubmitted ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200"}`}>
          <strong>Profile submitted:</strong> {detailsSubmitted ? "✓ Yes" : "Not yet"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!fullyReady && (
          <button onClick={startOnboard} disabled={loadingOnboard} className="btn-primary">
            {loadingOnboard ? "Opening Stripe…" : detailsSubmitted ? "Resume onboarding" : "Continue onboarding"}
          </button>
        )}
        <button onClick={openDashboard} disabled={loadingDashboard} className="btn-secondary">
          {loadingDashboard ? "Opening…" : "Open Stripe dashboard →"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
