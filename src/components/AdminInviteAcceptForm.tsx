"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mirrors the server-side strict policy (src/lib/admin-invite.ts). Kept inline so
// this client component doesn't import the server lib (which uses node:crypto).
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 12 characters", test: (p) => p.length >= 12 },
  { label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "A number", test: (p) => /[0-9]/.test(p) },
  { label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function AdminInviteAcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const allPass = RULES.every((r) => r.test(form.password));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPass) { setError("Please meet all password requirements."); return; }
    if (form.password !== form.confirm) { setError("Passwords don't match."); return; }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/admin-invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName: form.firstName, lastName: form.lastName, password: form.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not accept invite.");
        return;
      }
      router.push("/admin");
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      {error && <div role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

      <div>
        <label className="label">Email (from invite)</label>
        <input value={email} disabled className="input bg-slate-50 text-slate-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">First name *</label>
          <input required className="input" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div>
          <label className="label">Last name *</label>
          <input required className="input" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Password *</label>
        <input required type="password" className="input" value={form.password} onChange={(e) => set("password", e.target.value)} />
        <ul className="mt-2 space-y-1">
          {RULES.map((r) => {
            const ok = r.test(form.password);
            return (
              <li key={r.label} className={`flex items-center gap-2 text-xs ${ok ? "text-emerald-600" : "text-slate-400"}`}>
                <span aria-hidden>{ok ? "✓" : "○"}</span>
                {r.label}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <label className="label">Confirm password *</label>
        <input required type="password" className="input" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
      </div>

      <button type="submit" disabled={submitting || !allPass} className="btn-primary w-full">
        {submitting ? "Setting up…" : "Create admin account & sign in"}
      </button>
    </form>
  );
}
