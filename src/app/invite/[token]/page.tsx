import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({ params }: { params: { token: string } }) {
  const invite = await prisma.pendingInvite.findUnique({
    where: { token: params.token },
    include: { organization: true },
  });
  if (!invite) return notFound();

  const now = new Date();
  const expired = invite.expiresAt < now;
  const isPending = invite.status === "PENDING" && !expired;

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-brand-700">You're invited</div>
        <h1 className="mt-1 text-2xl font-bold">Join {invite.organization.name}</h1>
        <p className="mt-2 text-sm text-slate-600">on the Automated I.T. Solutions Events APP</p>

        {invite.message && (
          <div className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-800 ring-1 ring-brand-200">
            <strong>From your inviter:</strong>
            <p className="mt-1 whitespace-pre-line">{invite.message}</p>
          </div>
        )}

        {!isPending && (
          <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
            {invite.status === "ACCEPTED"
              ? "This invite has already been accepted. Please sign in instead."
              : invite.status === "REVOKED"
              ? "This invite has been revoked. Contact the organization admin if you need a new one."
              : "This invite has expired. Contact the organization admin to request a new one."}
          </div>
        )}

        {isPending && (
          <AcceptInviteForm token={params.token} email={invite.email} />
        )}
      </div>
    </main>
  );
}
