"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TicketType { id: string; name: string; priceCents: number; }
interface Props { eventId: string; eventSlug: string; ticketTypes: TicketType[]; }

export function VendorApplicationForm({ eventId, eventSlug, ticketTypes }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "", contactFirstName: "", contactLastName: "",
    email: "", phone: "", website: "", logoUrl: "",
    description: "", productCategory: "", boothPreference: "",
    sponsorshipLevel: "", electricalNeeds: false,
    additionalRequests: "", ticketTypeId: ticketTypes[0]?.id ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/vendors/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Submission failed. Please try again.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/events/${eventSlug}/vendors/submitted`);
    } catch (err: any) {
      setError(err?.message ?? "Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const money = (c: number) => c === 0 ? "Free" : `$${(c/100).toFixed(2)}`;

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold">Your company</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Company name</label>
            <input className="input" value={form.companyName} onChange={(e)=>set("companyName", e.target.value)} />
          </div>
          <div>
            <label className="label">Contact first name *</label>
            <input required className="input" value={form.contactFirstName} onChange={(e)=>set("contactFirstName", e.target.value)} />
          </div>
          <div>
            <label className="label">Contact last name *</label>
            <input required className="input" value={form.contactLastName} onChange={(e)=>set("contactLastName", e.target.value)} />
          </div>
          <div>
            <label className="label">Email *</label>
            <input required type="email" className="input" value={form.email} onChange={(e)=>set("email", e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e)=>set("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Website</label>
            <input type="url" placeholder="https://" className="input" value={form.website} onChange={(e)=>set("website", e.target.value)} />
          </div>
          <div>
            <label className="label">Logo URL (optional)</label>
            <input type="url" placeholder="https://…/logo.png" className="input" value={form.logoUrl} onChange={(e)=>set("logoUrl", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">What you'll offer</h2>
        <div className="mt-3 grid gap-4">
          <div>
            <label className="label">Brief description of your products/services *</label>
            <textarea required rows={4} className="input" value={form.description} onChange={(e)=>set("description", e.target.value)} placeholder="Tell the organizer what you'll be selling or showcasing at the booth…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Product category</label>
              <input className="input" placeholder="e.g. Tech, Food, Apparel, Services" value={form.productCategory} onChange={(e)=>set("productCategory", e.target.value)} />
            </div>
            <div>
              <label className="label">Booth size preference</label>
              <input className="input" placeholder="e.g. 10x10, end-cap, corner" value={form.boothPreference} onChange={(e)=>set("boothPreference", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Sponsorship interest</label>
              <input className="input" placeholder="e.g. Bronze, Silver, Gold tier" value={form.sponsorshipLevel} onChange={(e)=>set("sponsorshipLevel", e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.electricalNeeds} onChange={(e)=>set("electricalNeeds", e.target.checked)} />
                Need electrical power at booth
              </label>
            </div>
          </div>
          <div>
            <label className="label">Additional requests or notes</label>
            <textarea rows={3} className="input" value={form.additionalRequests} onChange={(e)=>set("additionalRequests", e.target.value)} />
          </div>
        </div>
      </section>

      {ticketTypes.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">Requested vendor package</h2>
          <p className="mt-1 text-sm text-slate-500">Pricing is per the organizer. Payment is collected only after the organizer approves your application.</p>
          <div className="mt-3 space-y-2">
            {ticketTypes.map((t) => (
              <label key={t.id} className={`flex items-center justify-between rounded-lg ring-1 ring-slate-200 p-3 cursor-pointer ${form.ticketTypeId === t.id ? "bg-brand-50 ring-brand-300" : ""}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="ticketTypeId" value={t.id} checked={form.ticketTypeId === t.id} onChange={()=>set("ticketTypeId", t.id)} />
                  <span className="font-medium">{t.name}</span>
                </div>
                <span className="text-sm font-medium">{money(t.priceCents)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-center text-xs text-slate-500">
        The organizer reviews every application and will email you with an update.
      </p>
    </form>
  );
}
