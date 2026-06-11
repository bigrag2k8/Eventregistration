import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ConnectActions } from "@/components/ConnectActions";
import { PLATFORM_FEE_PERCENT } from "@/lib/connect";
import { updateOrgSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/dashboard");

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
            <SignOutButton />
          </div>
        </div>
      </header>

      <form action={updateOrgSettingsAction} className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {searchParams.saved && (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ Settings saved. Public pages will reflect changes immediately.
          </div>
        )}

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
            <div>
              <label className="label">Logo URL</label>
              <input name="logoUrl" type="url" defaultValue={org.logoUrl ?? ""} className="input"
                     placeholder="https://yourorg.com/logo.png" />
              <p className="mt-1 text-xs text-slate-500">
                Square or wide logo on a transparent or white background works best. Host it anywhere with a public URL (your website, Imgur, Cloudinary, etc.).
              </p>
              {org.logoUrl && (
                <div className="mt-2 inline-block rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={org.logoUrl} alt="Current logo" className="h-12 max-w-[200px] object-contain" />
                </div>
              )}
            </div>
            <div>
              <label className="label">Banner image URL (optional)</label>
              <input name="bannerUrl" type="url" defaultValue={org.bannerUrl ?? ""} className="input"
                     placeholder="https://yourorg.com/hero.jpg" />
              <p className="mt-1 text-xs text-slate-500">Wide banner shown at the top of your public page. ~1600×400 looks best.</p>
            </div>
            <div>
              <label className="label">Primary brand color (hex)</label>
              <div className="flex items-center gap-3">
                <input name="brandColor" defaultValue={org.brandColor ?? ""} className="input flex-1 font-mono"
                       placeholder="#1F3A8A" maxLength={7} />
                <div className="h-10 w-12 rounded ring-1 ring-slate-300"
                     style={{ backgroundColor: org.brandColor ?? "#1F3A8A" }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Used for buttons, links, and accents on your public pages. Leave blank to use the default blue.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Public contact email</label>
              <input name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} className="input"
                     placeholder="hello@yourorg.com" />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input name="contactPhone" maxLength={40} defaultValue={org.contactPhone ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Website (optional)</label>
              <input name="website" type="url" defaultValue={org.website ?? ""} className="input"
                     placeholder="https://yourorg.com" />
            </div>
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
            By default, confirmation emails come from <code className="font-mono">events@yourevents.app</code>.
            You can use your own address — but the domain must be verified in our email provider (Resend) first. Contact your platform admin to set this up.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">From name (display name)</label>
              <input name="fromName" maxLength={80} defaultValue={org.fromName ?? ""} className="input"
                     placeholder="Harmony Lodge Events" />
            </div>
            <div>
              <label className="label">From email address</label>
              <input name="fromEmail" type="email" defaultValue={org.fromEmail ?? ""} className="input"
                     placeholder="events@harmonylodge.org" />
              <p className="mt-1 text-xs text-slate-500">Leave blank to use the default AITS sender.</p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Save settings</button>
        </div>
      </form>
    </main>
  );
}
