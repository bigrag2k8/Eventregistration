"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "attendees", label: "Attendee — questions about my ticket or registration" },
  { value: "organizers", label: "Organizer — events, payouts, billing, team" },
  { value: "everything-else", label: "Everything else — partnerships, press, security" },
];

const EMPTY = { name: "", email: "", category: "", subject: "", message: "", website: "" };

export function ContactForm() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setResult(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ error: typeof data.error === "string" ? data.error : "Could not send your message." });
        return;
      }
      setResult({ ok: true });
      setForm(EMPTY);
    } catch (err: any) {
      setResult({ error: err?.message ?? "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <h2 className="text-lg font-semibold text-emerald-900">✓ Message sent</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Thanks for reaching out. A real person will get back to you within one business day at the email you provided.
        </p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-4 text-sm font-medium text-emerald-800 underline hover:text-emerald-900"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
      {result?.error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          ⚠ {result.error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Your name *</label>
          <input
            required maxLength={120}
            value={form.name} onChange={(e) => set("name", e.target.value)}
            className="input" placeholder="Jane Doe" autoComplete="name"
          />
        </div>
        <div>
          <label className="label">Your email *</label>
          <input
            required type="email" maxLength={254}
            value={form.email} onChange={(e) => set("email", e.target.value)}
            className="input" placeholder="jane@example.com" autoComplete="email"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="label">I&rsquo;m asking as a&hellip; *</label>
        <select
          required
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
          className="input"
        >
          <option value="" disabled>— Pick one —</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="label">Subject (optional)</label>
        <input
          maxLength={200}
          value={form.subject} onChange={(e) => set("subject", e.target.value)}
          className="input" placeholder="e.g. Can't connect Stripe"
        />
      </div>

      <div className="mt-3">
        <label className="label">How can we help? *</label>
        <textarea
          required minLength={10} maxLength={8000} rows={6}
          value={form.message} onChange={(e) => set("message", e.target.value)}
          className="input"
          placeholder="Tell us a bit about the issue. If it's about a specific event, include the event name and the email you registered with."
        />
      </div>

      {/* Honeypot — hidden from real users, bots fill every input. The API
          silently discards submissions where this comes through filled. */}
      <div aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website (leave blank)
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">We&rsquo;ll reply to the email above.</span>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
