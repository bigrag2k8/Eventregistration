import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { firstName: true, lastName: true, phone: true, email: true },
  });
  if (!user) return null;

  return (
    <div>
      <h1 className="text-xl font-bold">Your profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        This information pre-fills your details when you register for new events.
      </p>

      {searchParams.saved && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Profile saved.
        </div>
      )}
      {searchParams.error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          Couldn't save — please check your entries.
        </div>
      )}

      <form action={updateProfileAction} className="card mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">First name</label>
            <input name="firstName" className="input" defaultValue={user.firstName ?? ""} />
          </div>
          <div>
            <label className="label">Last name</label>
            <input name="lastName" className="input" defaultValue={user.lastName ?? ""} />
          </div>
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="input" defaultValue={user.phone ?? ""} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input bg-slate-50" value={user.email} disabled readOnly />
          <p className="mt-1 text-xs text-slate-400">
            Your email is your sign-in identity and can't be changed here.
          </p>
        </div>
        <button type="submit" className="btn-primary">Save profile</button>
      </form>
    </div>
  );
}
