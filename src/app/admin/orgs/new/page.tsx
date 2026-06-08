import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createOrgAndInviteAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewOrgPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");

  return (
    <main>
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-sm opacity-80 hover:opacity-100">◀ Admin overview</Link>
          <span className="font-semibold">Invite organization</span>
          <span />
        </div>
      </header>

      <form action={createOrgAndInviteAction} className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <p className="text-slate-600">
          Create a new organization and send the contact an invite email. They will set their password
          and become an Organizer of the new org.
        </p>

        <section className="card">
          <h2 className="text-lg font-semibold">Organization</h2>
          <div className="mt-3 grid gap-4">
            <div>
              <label className="label">Organization name *</label>
              <input name="orgName" required maxLength={120} className="input" placeholder="Acme Events Co." />
            </div>
            <div>
              <label className="label">URL slug *</label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-500">/o/</span>
                <input
                  name="orgSlug"
                  required
                  pattern="[a-z0-9-]+"
                  maxLength={60}
                  className="input rounded-l-none"
                  placeholder="acme-events"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Lowercase letters, numbers, dashes. Will appear in their event URLs.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Contact (who will run this organization)</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name (optional)</label>
              <input name="contactFirstName" maxLength={80} className="input" />
            </div>
            <div>
              <label className="label">Last name (optional)</label>
              <input name="contactLastName" maxLength={80} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email *</label>
              <input name="contactEmail" type="email" required className="input" placeholder="contact@acme.com" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Personal message (optional, included in the invite email)</label>
              <textarea name="message" rows={3} className="input" placeholder="Hi Sam, looking forward to working together on your event lineup!" />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          <Link href="/admin" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Create organization + send invite</button>
        </div>
      </form>
    </main>
  );
}
