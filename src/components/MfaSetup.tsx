"use client";

import { useState } from "react";
import { startMfaSetupAction, confirmMfaSetupAction, disableMfaAction } from "@/app/dashboard/settings/mfa-actions";

export function MfaSetup({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [step, setStep] = useState<"idle" | "enroll" | "done">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true); setError(null);
    try {
      const res = await startMfaSetupAction();
      setQr(res.qrDataUrl); setSecret(res.secret); setStep("enroll");
    } catch {
      setError("Couldn’t start setup. Please try again.");
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await confirmMfaSetupAction(code.trim());
      if (!res.ok) { setError(res.error ?? "Invalid code"); return; }
      setCodes(res.recoveryCodes ?? []); setStep("done"); setOn(true); setCode("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function disable() {
    if (!window.confirm("Turn off two-factor authentication? You'll sign in with just your password.")) return;
    setBusy(true);
    try { await disableMfaAction(); setOn(false); setStep("idle"); setQr(null); }
    finally { setBusy(false); }
  }

  // Enabled + not mid-enrollment: status + disable.
  if (on && step !== "done") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Two-factor is on
        </span>
        <button onClick={disable} disabled={busy} className="btn-secondary text-sm">Turn off</button>
      </div>
    );
  }

  // Just finished: show recovery codes once.
  if (step === "done") {
    return (
      <div>
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Two-factor authentication is now on.
        </div>
        <p className="mt-4 text-sm font-medium">Save your recovery codes</p>
        <p className="mt-1 text-xs text-slate-500">
          Each code works once if you lose your authenticator device. Store them somewhere safe — this is the only time they’re shown.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm ring-1 ring-slate-200">
          {codes.map((c) => <div key={c}>{c}</div>)}
        </div>
        <button onClick={() => setStep("idle")} className="btn-primary mt-4 text-sm">Done</button>
      </div>
    );
  }

  // Mid-enrollment: QR + verify.
  if (step === "enroll") {
    return (
      <div>
        <p className="text-sm text-slate-600">
          Scan this with an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.
        </p>
        <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Two-factor QR code" className="rounded-lg ring-1 ring-slate-200" width={180} height={180} />
          )}
          <div className="text-xs text-slate-500">
            <div>Can’t scan? Enter this key manually:</div>
            <code className="mt-1 block break-all rounded bg-slate-50 p-2 font-mono text-slate-700 ring-1 ring-slate-200">{secret}</code>
          </div>
        </div>
        <form onSubmit={verify} className="mt-4 flex items-end gap-2">
          <div>
            <label className="label">6-digit code</label>
            <input
              className="input w-32 font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </div>
          <button className="btn-primary" disabled={busy || code.length < 6} type="submit">Verify &amp; turn on</button>
          <button type="button" onClick={() => { setStep("idle"); setError(null); }} className="btn-secondary">Cancel</button>
        </form>
        {error && <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      </div>
    );
  }

  // Off, idle.
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-500">Two-factor is off.</span>
      <button onClick={start} disabled={busy} className="btn-primary text-sm">{busy ? "…" : "Enable two-factor"}</button>
    </div>
  );
}
