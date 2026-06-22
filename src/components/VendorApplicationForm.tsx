"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VENDOR_CATEGORIES } from "@/lib/vendor-categories";

interface Props {
  eventId: string;
  eventSlug: string;
  backHref?: string;       // where Cancel returns to
  submittedHref?: string;  // where to redirect after successful submission
}

export function VendorApplicationForm({ eventId, eventSlug, backHref, submittedHref }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "", contactFirstName: "", contactLastName: "",
    email: "", phone: "", website: "", logoUrl: "",
    addressLine1: "", addressLine2: "", city: "", state: "", zipCode: "", country: "United States",
    description: "", productCategory: "", boothPreference: "",
    additionalRequests: "",
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
      router.push(submittedHref ?? `/events/${eventSlug}/vendors/submitted`);
    } catch (err: any) {
      setError(err?.message ?? "Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
            <label className="label">Phone *</label>
            <input required maxLength={40} placeholder="(555) 123-4567" className="input" value={form.phone} onChange={(e)=>set("phone", e.target.value)} />
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

        <h3 className="mt-4 text-sm font-medium text-slate-700">Mailing address *</h3>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Street address *</label>
            <input required maxLength={200} className="input" placeholder="123 Main St" value={form.addressLine1} onChange={(e)=>set("addressLine1", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address line 2</label>
            <input maxLength={200} className="input" placeholder="Suite, unit, etc. (optional)" value={form.addressLine2} onChange={(e)=>set("addressLine2", e.target.value)} />
          </div>
          <div>
            <label className="label">City *</label>
            <input required maxLength={100} className="input" value={form.city} onChange={(e)=>set("city", e.target.value)} />
          </div>
          <div>
            <label className="label">State / Province *</label>
            <input required maxLength={100} className="input" value={form.state} onChange={(e)=>set("state", e.target.value)} />
          </div>
          <div>
            <label className="label">ZIP / Postal code *</label>
            <input required maxLength={20} className="input" value={form.zipCode} onChange={(e)=>set("zipCode", e.target.value)} />
          </div>
          <div>
            <label className="label">Country *</label>
            <input required maxLength={100} className="input" value={form.country} onChange={(e)=>set("country", e.target.value)} />
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
              <label className="label">Product category *</label>
              <select required className="input" value={form.productCategory} onChange={(e)=>set("productCategory", e.target.value)}>
                <option value="">Select a category…</option>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Booth size preference</label>
              <input className="input" placeholder="e.g. 10x10, end-cap, corner" value={form.boothPreference} onChange={(e)=>set("boothPreference", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Additional requests or notes</label>
            <textarea rows={3} className="input" value={form.additionalRequests} onChange={(e)=>set("additionalRequests", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card bg-slate-50">
        <h2 className="text-lg font-semibold">Booth pricing</h2>
        <p className="mt-1 text-sm text-slate-600">
          The organizer will confirm your booth fee when they review your application. You will only be
          charged after approval, via a secure payment link emailed to you.
        </p>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref ?? `/events/${eventSlug}`}
          onClick={(e) => {
            const dirty =
              form.companyName || form.contactFirstName || form.contactLastName ||
              form.email || form.phone || form.website || form.logoUrl ||
              form.addressLine1 || form.city || form.state || form.zipCode || form.country ||
              form.description || form.productCategory || form.boothPreference ||
              form.additionalRequests;
            if (dirty && !confirm("Discard this application? Anything you've entered will be lost.")) {
              e.preventDefault();
            }
          }}
          className="btn-secondary text-center"
        >
          Cancel
        </Link>
        <button type="submit" disabled={submitting} className="btn-primary sm:flex-1">
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        The organizer reviews every application and will email you with an update.
      </p>
    </form>
  );
}
