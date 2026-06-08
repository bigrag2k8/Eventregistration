"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteForm({ token, email, prefillFirstName, prefillLastName }: {
  token: string; email: string; prefillFirstName?: string; prefillLastName?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: prefillFirstName ?? "",
    lastName: prefillLastName ?? "",
    password: "",
    confirm: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not accept invite.");
        return;
      }
      router.push("/dashboard");
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
        <input required type="password" minLength={8} className="input" value={form.password} onChange={(e) => set("password", e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label className="label">Confirm password *</label>
        <input required type="password" minLength={8} className="input" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
      </div>

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Setting up…" : "Accept invite & sign in"}
      </button>
    </form>
  );
}
