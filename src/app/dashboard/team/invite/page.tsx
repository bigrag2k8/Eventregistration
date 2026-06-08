import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inviteTeamMemberAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function InviteTeamMemberPage() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) redirect("/dashboard");
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/dashboard");

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/dashboard/team" className="text-sm text-brand-700">◀ Team</Link>
          <span className="font-semibold">Invite team member</span>
          <span />
        </div>
      </header>

      <form action={inviteTeamMemberAction} className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <p className="text-slate-600">
          Invite a staff member, volunteer, or co-organizer to <strong>{org.name}</strong>.
          They'll receive an email with a link to set up their account.
        </p>

        <section className="card">
          <h2 className="text-lg font-semibold">Person</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name (optional)</label>
              <input name="invitedFirstName" maxLength={80} className="input" placeholder="Jane" />
            </div>
            <div>
              <label className="label">Last name (optional)</label>
              <input name="invitedLastName" maxLength={80} className="input" placeholder="Doe" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email *</label>
              <input name="email" type="email" required className="input" placeholder="jane@example.com" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Role</h2>
          <p className="mt-1 text-sm text-slate-500">Choose what this person will be able to do.</p>

          <div className="mt-3 space-y-2">
            <RoleOption value="VOLUNTEER" label="Volunteer"
              description="Help at events. Can use the check-in scanner. Cannot manage events or see financials. Tracked separately from paid staff for reporting." defaultChecked />
            <RoleOption value="STAFF" label="Staff"
              description="Paid event staff. Same access as volunteer: check-in only. Tracked separately." />
            <RoleOption value="ORGANIZER" label="Organizer (co-admin)"
              description="Full access — create and manage events, view registrations, manage team, see revenue. Use sparingly." />
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Their duties (optional)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Briefly describe what this person will be doing. Included in their invite email and shown when they accept.
          </p>
          <textarea
            name="roleDescription"
            rows={4}
            maxLength={2000}
            className="input mt-3"
            placeholder="e.g. Door check-in for the 2026 AI Summit. Shift: Saturday 8am–2pm. Report to Olivia at the front lobby."
          />
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Personal message (optional)</h2>
          <p className="mt-1 text-sm text-slate-500">A friendly note included in the email above their invite link.</p>
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            className="input mt-3"
            placeholder="Thanks for volunteering! Looking forward to having you on the team."
          />
        </section>

        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard/team" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary">Send invite</button>
        </div>
      </form>
    </main>
  );
}

function RoleOption({ value, label, description, defaultChecked }: {
  value: string; label: string; description: string; defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg ring-1 ring-slate-200 p-3 hover:bg-slate-50">
      <input type="radio" name="role" value={value} defaultChecked={defaultChecked} className="mt-1" />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
    </label>
  );
}
