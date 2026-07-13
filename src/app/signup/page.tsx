"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrgNameSlugFields } from "@/components/OrgNameSlugFields";
import { AddressFields } from "@/components/AddressFields";

export default function SignUpPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugValid, setSlugValid] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSubmitting(true);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: fd.get("firstName"),
          lastName: fd.get("lastName"),
          email: fd.get("email"),
          password: fd.get("password"),
          orgName: fd.get("orgName"),
          orgSlug: fd.get("orgSlug"),
          contactPhone: fd.get("contactPhone"),
          addressLine1: fd.get("addressLine1"),
          addressLine2: fd.get("addressLine2"),
          city: fd.get("city"),
          state: fd.get("state"),
          zipCode: fd.get("zipCode"),
          country: fd.get("country"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Sign up failed.");
        return;
      }
      // Plan-required gate: new accounts always land on billing first
      router.push("/dashboard/billing?welcome=1");
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
        Sign up your organization in two minutes. You'll pick a plan on the next screen — free plan available.
        Already have an account?{" "}
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
              <label className="label" htmlFor="su-firstName">First name *</label>
              <input id="su-firstName" name="firstName" autoComplete="given-name" required maxLength={80} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="su-lastName">Last name *</label>
              <input id="su-lastName" name="lastName" autoComplete="family-name" required maxLength={80} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="su-email">Email *</label>
              <input id="su-email" name="email" autoComplete="email" required type="email" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="su-phone">Phone *</label>
              <input id="su-phone" name="contactPhone" autoComplete="tel" type="tel" required maxLength={40} className="input" placeholder="(555) 123-4567" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="su-password">Password *</label>
              <input id="su-password" name="password" autoComplete="new-password" required type="password" minLength={8} className="input" />
              <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold">Your organization</h2>
          <p className="mt-1 text-xs text-slate-500">This is the name attendees will see when they register for your events.</p>
          <div className="mt-3 space-y-3">
            <OrgNameSlugFields namePlaceholder="Acme Events" slugPlaceholder="acme-events" onValidityChange={setSlugValid} />
          </div>
        </section>

        <section className="card">
          <h2 className="text-base font-semibold">Mailing address</h2>
          <p className="mt-1 text-xs text-slate-500">
            Where your organization is based. Used for billing receipts, tax documents, and account verification.
          </p>
          <div className="mt-3">
            <AddressFields required />
          </div>
        </section>

        <button type="submit" disabled={submitting || !slugValid} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? "Creating account…" : !slugValid ? "Pick an available URL to continue" : "Create account → pick a plan"}
        </button>
        <p className="text-center text-xs text-slate-500">
          You won't be charged until you select a paid plan. A free tier is available.
        </p>
      </form>
    </main>
  );
}
