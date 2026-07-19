"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show the same confirmation — the endpoint never reveals whether
      // an account exists.
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the email for your organizer or staff account and we'll send you a link to set a new password.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <strong>Check your inbox.</strong>
          <p className="mt-1">
            If there's an account for <strong>{email}</strong>, we just sent a password-reset link.
            It expires in 15 minutes.
          </p>
        </div>
      ) : (
        <form method="post" onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Remembered it? <Link href="/signin" className="underline">Back to sign in</Link>.
      </p>
    </main>
  );
}
