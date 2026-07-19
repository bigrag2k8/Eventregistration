"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Second-factor state: once the password step returns mfaRequired we hold the
  // short-lived challenge token and switch the form to a code prompt.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Staff/volunteers (or MFA accounts) redirected here from the magic-link flow.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "use_password") {
      setNotice("This account signs in with a password. Enter yours below — use “Forgot password?” if you need to set or reset it.");
    }
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Sign in failed"); return; }
      if (j.mfaRequired && j.mfaToken) { setMfaToken(j.mfaToken); return; }
      router.push(j.redirectTo ?? "/dashboard");
    } finally { setBusy(false); }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken, code: code.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Invalid code");
        // An expired challenge sends them back to the password step.
        if (res.status === 401 && /expired/i.test(j.error ?? "")) { setMfaToken(null); setPassword(""); }
        return;
      }
      router.push(j.redirectTo ?? "/dashboard");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Organizer &amp; Staff</p>
      <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">For event hosts and their team.</p>

      {!mfaToken ? (
        <>
          {notice && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">{notice}</div>}
          <form method="post" onSubmit={submitPassword} className="mt-6 space-y-3">
            <div><label className="label">Email</label><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="label">Password</label><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <button className="btn-primary w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="mt-3 text-sm">
            <a href="/forgot-password" className="text-brand-700 hover:underline">Forgot password?</a>
          </p>
          <p className="mt-6 text-xs text-slate-400">
            Are you an attendee? <a href="/account/signin" className="underline">Sign in to your account</a>.
          </p>
        </>
      ) : (
        <form method="post" onSubmit={submitCode} className="mt-6 space-y-3">
          <p className="text-sm text-slate-600">
            Enter the 6-digit code from your authenticator app. Lost your device? Enter one of your recovery codes instead.
          </p>
          <div>
            <label className="label">Authentication code</label>
            <input
              className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code"
              autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </div>
          {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full" type="submit" disabled={busy || code.trim().length < 6}>{busy ? "Verifying…" : "Verify"}</button>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-900" onClick={() => { setMfaToken(null); setError(null); setCode(""); }}>
            ← Back
          </button>
        </form>
      )}
    </main>
  );
}
