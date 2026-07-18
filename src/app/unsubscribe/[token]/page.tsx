import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/auth";
import { unsubscribeAction } from "./actions";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full rounded-2xl bg-white p-8 ring-1 ring-slate-200">{children}</div>
    </main>
  );
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { done?: string };
}) {
  const claim = await verifyUnsubscribeToken(params.token);
  if (!claim) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This unsubscribe link isn&rsquo;t valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          Try the link straight from the email. If it still doesn&rsquo;t work, reply to that email and ask to be removed.
        </p>
      </Shell>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: claim.organizationId },
    select: { name: true },
  });
  const orgName = org?.name ?? "this organizer";

  if (searchParams?.done) {
    return (
      <Shell>
        <div className="text-3xl" aria-hidden>✓</div>
        <h1 className="mt-2 text-xl font-semibold">You&rsquo;re unsubscribed</h1>
        <p className="mt-2 text-sm text-slate-600">
          {claim.email} won&rsquo;t get marketing emails from {orgName} anymore. You&rsquo;ll still get essential emails
          about events you register for (tickets, reminders, refunds).
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Unsubscribe from {orgName}?</h1>
      <p className="mt-2 text-sm text-slate-600">
        Stop marketing emails from <strong>{orgName}</strong> to <strong>{claim.email}</strong>. This won&rsquo;t affect
        tickets or reminders for events you register for.
      </p>
      <form action={unsubscribeAction} className="mt-5">
        <input type="hidden" name="token" value={params.token} />
        <button type="submit" className="btn-primary w-full">Unsubscribe</button>
      </form>
    </Shell>
  );
}
