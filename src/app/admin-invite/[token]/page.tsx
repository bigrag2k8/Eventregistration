import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminInviteAcceptForm } from "@/components/AdminInviteAcceptForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept admin invite — Your Events App" };

export default async function AdminInviteAcceptPage({ params }: { params: { token: string } }) {
  const invite = await prisma.adminInvite.findUnique({ where: { token: params.token } });
  if (!invite) return notFound();

  const expired = invite.expiresAt < new Date();
  const isPending = invite.status === "PENDING" && !expired;

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-brand-700">Platform administrator invite</div>
        <h1 className="mt-1 text-2xl font-bold">Set up your admin account</h1>
        <p className="mt-2 text-sm text-slate-600">
          You&apos;ve been invited to administer Your Events App with full platform access.
        </p>

        {!isPending ? (
          <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
            {invite.status === "ACCEPTED"
              ? "This invite has already been used. Please sign in instead."
              : invite.status === "REVOKED"
              ? "This invite has been revoked. Ask the platform owner for a new one."
              : "This invite has expired. Ask the platform owner for a new one."}
          </div>
        ) : (
          <AdminInviteAcceptForm token={params.token} email={invite.email} />
        )}
      </div>
    </main>
  );
}
