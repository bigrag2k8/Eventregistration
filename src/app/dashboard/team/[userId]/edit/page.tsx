import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { ErrorBanner } from "@/components/ErrorBanner";
import { updateMemberAction } from "../../actions";

export const dynamic = "force-dynamic";

const EDITABLE_ROLES = ["ORGANIZER", "ADMIN", "STAFF", "VOLUNTEER"] as const;

export default async function EditTeamMemberPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { error?: string };
}) {
  // ORGANIZER role only — non-organizers don't reach the edit page at all.
  const session = await requireRolePage(["ORGANIZER"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  const [org, target] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.orgId } }),
    prisma.user.findFirst({
      where: { id: params.userId, organizationId: session.orgId, deletedAt: null },
    }),
  ]);
  if (!org || !target) notFound();
  if (target.role === "SUPERADMIN") redirect("/dashboard/team?error=cant_edit_superadmin");

  const isSelf = target.id === session.sub;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
            <span className="text-slate-300">/</span>
            <Link href="/dashboard/team" className="text-sm text-slate-600 hover:text-slate-900">Team</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Edit member</span>
          </div>
          <Link href="/dashboard/team" className="text-sm text-slate-600 hover:text-slate-900">◀ Back to team</Link>
        </div>
      </header>

      <form action={updateMemberAction} className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        <input type="hidden" name="userId" value={target.id} />

        <div>
          <h1 className="text-2xl font-bold">
            Edit{" "}
            {[target.firstName, target.lastName].filter(Boolean).join(" ") || target.email}
          </h1>
          <p className="text-sm text-slate-500">
            Update this team member&rsquo;s contact details and role. Email changes will sign them out
            of any active sessions so they re-authenticate with the new address.
          </p>
        </div>

        <section className="card">
          <h2 className="text-lg font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name *</label>
              <input name="firstName" required maxLength={80} defaultValue={target.firstName ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Last name *</label>
              <input name="lastName" required maxLength={80} defaultValue={target.lastName ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email *</label>
              <input
                name="email"
                type="email"
                required
                maxLength={200}
                defaultValue={target.email}
                className="input"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used to sign in and to receive notifications. Must be unique across the platform.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Phone</label>
              <input
                name="phone"
                maxLength={40}
                defaultValue={target.phone ?? ""}
                placeholder="(555) 123-4567"
                className="input"
              />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Mailing address</h2>
          <p className="mt-1 text-sm text-slate-500">
            Personal address for this team member. Optional — useful if you ship credentials,
            badges, or paperwork to staff at their home.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Street address</label>
              <input
                name="addressLine1"
                maxLength={200}
                defaultValue={target.addressLine1 ?? ""}
                placeholder="123 Main St"
                className="input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address line 2</label>
              <input
                name="addressLine2"
                maxLength={200}
                defaultValue={target.addressLine2 ?? ""}
                placeholder="Suite, unit, etc."
                className="input"
              />
            </div>
            <div>
              <label className="label">City</label>
              <input name="city" maxLength={100} defaultValue={target.city ?? ""} className="input" />
            </div>
            <div>
              <label className="label">State / Province</label>
              <input name="state" maxLength={100} defaultValue={target.state ?? ""} className="input" />
            </div>
            <div>
              <label className="label">ZIP / Postal code</label>
              <input name="zipCode" maxLength={20} defaultValue={target.zipCode ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Country</label>
              <input name="country" maxLength={100} defaultValue={target.country ?? ""} className="input" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Role</h2>
          <p className="mt-1 text-sm text-slate-500">
            Determines what this person can do in your organization. ORGANIZERS can edit team
            members, ADMINS manage settings, STAFF and VOLUNTEERS handle check-in.
          </p>
          {isSelf && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              You can&rsquo;t change your own role. Ask another ORGANIZER to do it.
            </div>
          )}
          <div className="mt-4">
            <label className="label">Role *</label>
            <select
              name="role"
              required
              defaultValue={target.role}
              disabled={isSelf}
              className="input disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {EDITABLE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/team" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Save changes</button>
        </div>
      </form>
    </main>
  );
}
