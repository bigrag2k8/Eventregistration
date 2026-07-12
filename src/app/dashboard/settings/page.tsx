import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ConnectActions } from "@/components/ConnectActions";
import { PLATFORM_FEE_PERCENT } from "@/lib/connect";
import { updateOrgSettingsAction } from "./actions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MfaSetup } from "@/components/MfaSetup";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { BrandColorInput } from "@/components/BrandColorInput";
import { AddressFields } from "@/components/AddressFields";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/dashboard");
  const me = await prisma.user.findUnique({ where: { id: session.sub }, select: { mfaEnabled: true } });

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Settings</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">◀ Dashboard</Link>
            <Link href={`/o/${org.slug}`} target="_blank" className="text-sm text-brand-700 hover:underline">View public page ↗</Link>
          </div>
        </div>
      </header>

      <form action={updateOrgSettingsAction} className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {/* Success acknowledgment is rendered globally by <SavedToast/> in the
            root layout — a centered popup that auto-dismisses, so users don't
            have to scroll back to the top of long forms to see "saved". */}

        <section className="card">
          <h2 className="text-lg font-semibold">Organization</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your URL slug (<code className="font-mono">/o/{org.slug}</code>) can be changed by a platform admin only,
            since changing it would break any links your attendees have.
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="label">Organization name *</label>
              <input name="name" required maxLength={120} defaultValue={org.name} className="input" />
            </div>
            <div>
              <label className="label">Tagline (one short line shown under your name)</label>
              <input name="tagline" maxLength={160} defaultValue={org.tagline ?? ""} className="input"
                     placeholder="Hosting unforgettable community events" />
            </div>
            <div>
              <label className="label">About (longer description shown on your public page)</label>
              <textarea name="aboutBlurb" rows={4} maxLength={4000} defaultValue={org.aboutBlurb ?? ""} className="input"
                        placeholder="Tell visitors about your organization, mission, the kind of events you host, etc." />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Brand</h2>
          <p className="mt-1 text-sm text-slate-500">
            Make your public pages and emails look like your organization, not ours.
          </p>
          <div className="mt-4 grid gap-4">
            <ImageUploadInput
              name="logoUrl"
              defaultUrl={org.logoUrl}
              label="Logo"
              aspect="3 / 1"
              previewFit="contain"
              folder="eventflow/logos"
              placeholder="https://yourorg.com/logo.png"
              hint="Square or wide logo on a transparent or white background works best. Upload a file, or paste a public URL."
            />
            <ImageUploadInput
              name="bannerUrl"
              defaultUrl={org.bannerUrl}
              label="Banner image (optional)"
              aspect="16 / 6"
              previewFit="cover"
              folder="eventflow/org-banners"
              placeholder="https://yourorg.com/hero.jpg"
              hint="Wide banner shown at the top of your public page. ~1600×400 looks best."
            />
            <div>
              <label className="label">Primary brand color (hex)</label>
              <BrandColorInput name="brandColor" defaultValue={org.brandColor} />
              <p className="mt-1 text-xs text-slate-500">Used for buttons, links, and accents on your public pages. Leave blank to use the default blue.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Contact</h2>
          {!org.contactPhone && (
            <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Please add your phone number to complete your organization profile.
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Public contact email</label>
              <input name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} className="input"
                     placeholder="hello@yourorg.com" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input name="contactPhone" required maxLength={40} defaultValue={org.contactPhone ?? ""} className="input"
                     placeholder="(555) 123-4567" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Website (optional)</label>
              <input name="website" type="url" defaultValue={org.website ?? ""} className="input"
                     placeholder="https://yourorg.com" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Mailing address</h2>
          <p className="mt-1 text-sm text-slate-500">
            Where your organization is based. Used for billing receipts, tax documents, and account verification.
          </p>
          {!org.addressLine1 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Please add your mailing address to complete your organization profile.
            </div>
          )}
          <div className="mt-4">
            <AddressFields
              required
              defaults={{
                addressLine1: org.addressLine1,
                addressLine2: org.addressLine2,
                city: org.city,
                state: org.state,
                zipCode: org.zipCode,
                country: org.country,
              }}
            />
          </div>
        </section>

        <section id="payouts" className="card scroll-mt-20">
          <h2 className="text-lg font-semibold">Payouts (Stripe Connect)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Connect your Stripe account so attendee ticket sales and vendor booth fees go directly into
            your bank account. Your Events App takes a <strong>{PLATFORM_FEE_PERCENT}% platform fee</strong> on
            each transaction (on top of Stripe's standard processing fees). You manage your own payouts and refunds.
          </p>
          <div className="mt-4">
            <ConnectActions
              hasAccount={!!org.stripeAccountId}
              chargesEnabled={org.stripeAccountChargesEnabled}
              payoutsEnabled={org.stripeAccountPayoutsEnabled}
              detailsSubmitted={org.stripeAccountDetailsSubmitted}
            />
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Email sender</h2>
          <p className="mt-1 text-sm text-slate-500">
            All confirmation, reminder, and notification emails are sent from{" "}
            <code className="font-mono">events@yourevents.app</code>.
          </p>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Save settings</button>
        </div>
      </form>

      {/* Two-factor lives outside the settings form — it has its own actions. */}
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <section className="card">
          <h2 className="text-lg font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-slate-500">
            Require a one-time code from an authenticator app at sign-in, so a stolen
            password alone can’t get into your account.
          </p>
          <div className="mt-4">
            <MfaSetup enabled={me?.mfaEnabled ?? false} />
          </div>
        </section>
      </div>
    </main>
  );
}
