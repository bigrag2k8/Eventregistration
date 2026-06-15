"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/signin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Sign in failed");
      return;
    }
    const j = await res.json().catch(() => ({ redirectTo: "/dashboard" }));
    router.push(j.redirectTo ?? "/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Organizer &amp; Staff</p>
      <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">For event hosts and their team.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Password</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" type="submit">Sign in</button>
      </form>
      <p className="mt-3 text-sm">
        <a href="/forgot-password" className="text-brand-700 hover:underline">Forgot password?</a>
      </p>
      <p className="mt-6 text-xs text-slate-400">
        Are you an attendee? <a href="/account/signin" className="underline">Sign in to your account</a>.
      </p>
    </main>
  );
}
