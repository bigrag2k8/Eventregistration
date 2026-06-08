"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function slugify(name: string) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function SignUpPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "",
    orgName: "", orgSlug: "",
    slugTouched: false,
  });

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onOrgNameChange(v: string) {
    set("orgName", v);
    if (!form.slugTouched) set("orgSlug", slugify(v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, password: form.password,
          orgName: form.orgName, orgSlug: form.orgSlug,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Sign up failed.");
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
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-slate-600">
        You'll get an organization to host your events under. Already have an account?{" "}
        <Link href="/signin" className="text-brand-700 hover:underline">Sign in</Link>.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
        )}

        <section className="card">
          <h2 className="text-base font-semibold">About you</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input required className="input" value={form.firstName} onChange={(e)=>set("firstName", e.target.value)} />
            </div>
            <div>
              <label className="label">Last name *</label>
              <input required className="input" value={form.lastName} onChange={(e)=>set("lastName", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email *</label>
              <input required type="email" className="input" value={form.email} onChange={(e)=>set("email", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Password *</label>
              <input required type="password" minLength={8} className="input" value={form.password} onChange={(e)=>set("password", e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold">Your organization</h2>
          <p className="mt-1 text-xs text-slate-500">This is the name attendees will see when they register for your events.</p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="label">Organization name *</label>
              <input required maxLength={120} className="input" value={form.orgName} onChange={(e) => onOrgNameChange(e.target.value)} placeholder="Acme Events" />
            </div>
            <div>
              <label className="label">URL slug *</label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-500">
                  /o/
                </span>
                <input
                  required
                  pattern="[a-z0-9-]+"
                  maxLength={60}
                  className="input rounded-l-none"
                  value={form.orgSlug}
                  onChange={(e) => { set("orgSlug", slugify(e.target.value)); set("slugTouched", true); }}
                  placeholder="acme-events"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Lowercase letters, numbers, and dashes only. Used in your event URLs.</p>
            </div>
          </div>
        </section>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Creating account…" : "Create account & organization"}
        </button>
      </form>
    </main>
  );
}
