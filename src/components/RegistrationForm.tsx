"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface TicketType {
  id: string; name: string; priceCents: number; quantityTotal: number | null;
  quantitySold: number; currency: string;
}
interface Question { id: string; label: string; type: string; required: boolean; options: any }
interface Event {
  id: string; slug: string; name: string;
  ticketTypes: TicketType[]; customQuestions: Question[];
  taxRatePct: string | null; passProcessingFee: boolean;
}

export function RegistrationForm({ event }: { event: Event }) {
  const router = useRouter();
  const [ticketTypeId, setTicketTypeId] = useState(event.ticketTypes[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", company: "",
    jobTitle: "", dietary: "", accessibility: "", specialRequests: "",
    promoCode: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const tt = event.ticketTypes.find((t) => t.id === ticketTypeId);
  const subtotal = (tt?.priceCents ?? 0) * quantity;
  const taxRate = Number(event.taxRatePct ?? 0);
  const tax = Math.round((subtotal * taxRate) / 100);
  const fee = event.passProcessingFee && subtotal > 0 ? Math.round(subtotal * 0.029) + 30 : 0;
  const total = subtotal + tax + fee;

  function setField<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null); setFieldErrors({});
    try {
      const res = await fetch("/api/registrations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id, ticketTypeId, quantity, ...form,
          answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
        setError(message);
        if (data.fieldErrors && typeof data.fieldErrors === "object") setFieldErrors(data.fieldErrors);
        // scroll to top so user sees the banner
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (data.status === "CONFIRMED") {
        router.push(`/events/${event.slug}/success?reg=${data.id}`);
      } else {
        const c = await fetch("/api/checkout/session", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId: data.id }),
        });
        const cData = await c.json().catch(() => ({}));
        if (!c.ok || !cData.url) {
          setError(cData.error ?? "Couldn't start checkout. Please try again.");
          return;
        }
        window.location.href = cData.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function fieldErr(name: string) {
    const e = fieldErrors[name];
    return e?.[0] ? <p className="mt-1 text-xs text-red-600">{e[0]}</p> : null;
  }
  function inputClass(name: string) {
    return `input${fieldErrors[name] ? " border-red-400 ring-1 ring-red-100" : ""}`;
  }

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
          <div className="flex items-start gap-2">
            <span className="text-red-600">⚠</span>
            <div>
              <p className="text-sm font-medium text-red-800">We couldn't complete your registration</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      <section className="card">
        <h2 className="text-lg font-semibold">1. Select ticket</h2>
        <div className="mt-3 space-y-2">
          {event.ticketTypes.map((t) => {
            const left = t.quantityTotal ? t.quantityTotal - t.quantitySold : null;
            const soldOut = left !== null && left <= 0;
            return (
              <label key={t.id} className={`flex items-center justify-between rounded-lg ring-1 ring-slate-200 p-3 ${ticketTypeId === t.id ? "bg-brand-50 ring-brand-300" : ""} ${soldOut ? "opacity-40" : "cursor-pointer"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio" name="ticket" value={t.id}
                    checked={ticketTypeId === t.id}
                    onChange={() => setTicketTypeId(t.id)}
                    disabled={soldOut}
                  />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-500">
                      {soldOut ? "Sold out" : left !== null ? `${left} left` : ""}
                    </div>
                  </div>
                </div>
                <div className="font-medium">{t.priceCents === 0 ? "Free" : fmt(t.priceCents)}</div>
              </label>
            );
          })}
        </div>
        <div className="mt-3">
          <label className="label">Quantity</label>
          <input type="number" min={1} max={10} value={quantity}
                 onChange={(e) => setQuantity(parseInt(e.target.value || "1"))}
                 className="input w-24" />
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">2. Your info</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">First name *</label>
            <input required className={inputClass("firstName")} value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} />
            {fieldErr("firstName")}
          </div>
          <div>
            <label className="label">Last name *</label>
            <input required className={inputClass("lastName")} value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} />
            {fieldErr("lastName")}
          </div>
          <div>
            <label className="label">Email *</label>
            <input required type="email" className={inputClass("email")} value={form.email} onChange={(e) => setField("email", e.target.value)} />
            {fieldErr("email")}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input required className={inputClass("phone")} value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            {fieldErr("phone")}
          </div>
          <div>
            <label className="label">Company *</label>
            <input required className={inputClass("company")} value={form.company} onChange={(e) => setField("company", e.target.value)} />
            {fieldErr("company")}
          </div>
          <div>
            <label className="label">Job title</label>
            <input className={inputClass("jobTitle")} value={form.jobTitle} onChange={(e) => setField("jobTitle", e.target.value)} />
            {fieldErr("jobTitle")}
          </div>
          <div><label className="label">Dietary restrictions</label><input className="input" value={form.dietary} onChange={(e) => setField("dietary", e.target.value)} /></div>
          <div><label className="label">Accessibility</label><input className="input" value={form.accessibility} onChange={(e) => setField("accessibility", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label">Special requests</label><textarea className="input" rows={2} value={form.specialRequests} onChange={(e) => setField("specialRequests", e.target.value)} /></div>
        </div>
      </section>

      {event.customQuestions.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">3. Additional questions</h2>
          <div className="mt-3 space-y-3">
            {event.customQuestions.map((q) => (
              <div key={q.id}>
                <label className="label">{q.label}{q.required && " *"}</label>
                {(q.type === "DROPDOWN" || q.type === "RADIO") && Array.isArray(q.options) ? (
                  <select required={q.required} className="input"
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                    <option value="">Select…</option>
                    {(q.options as string[]).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input required={q.required} className="input"
                         onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold">4. Promo code</h2>
        <input
          className={`${inputClass("promoCode")} mt-3 max-w-xs`}
          placeholder="Enter code"
          value={form.promoCode}
          onChange={(e) => setField("promoCode", e.target.value)}
        />
        {fieldErr("promoCode")}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">5. Order summary</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{fmt(subtotal)}</dd></div>
          {tax > 0 && <div className="flex justify-between"><dt>Tax ({taxRate}%)</dt><dd>{fmt(tax)}</dd></div>}
          {fee > 0 && <div className="flex justify-between"><dt>Processing fee</dt><dd>{fmt(fee)}</dd></div>}
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt><dd>{fmt(total)}</dd>
          </div>
        </dl>
      </section>

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Processing…" : total === 0 ? "Complete registration" : `Pay ${fmt(total)} & register`}
      </button>
    </form>
  );
}
