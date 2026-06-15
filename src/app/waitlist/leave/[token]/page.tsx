import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { leaveWaitlistAction } from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  params: { token: string };
  searchParams: { confirmed?: string; error?: string };
}

export default async function LeaveWaitlistPage({ params, searchParams }: Props) {
  if (!params.token || params.token === "_") return notFound();

  const entry = await prisma.waitlist.findFirst({
    where: { leaveToken: params.token },
    include: { event: true },
  });
  if (!entry) return notFound();

  const confirmed = searchParams.confirmed === "1" || entry.status === "LEFT";
  const alreadyConverted = entry.status === "CONVERTED";
  const alreadyExpired = entry.status === "EXPIRED";

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="card text-center">
        <h1 className="text-2xl font-bold">Leave the waitlist?</h1>
        <p className="mt-2 text-sm text-slate-600">
          {entry.event.name}
        </p>

        {confirmed ? (
          <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            You've been removed from the waitlist. The spot will be offered to the next person.
          </div>
        ) : alreadyConverted ? (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            You've already registered for this event — no action needed.
          </div>
        ) : alreadyExpired ? (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            This waitlist invitation has already expired.
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              You're on the waitlist as <strong>{entry.firstName} {entry.lastName}</strong> ({entry.email}).
              Leaving the waitlist means we'll offer your spot to the next person right away.
            </p>
            {searchParams.error && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
                Something went wrong. Please try again or contact the organizer.
              </div>
            )}
            <form action={leaveWaitlistAction} className="mt-6">
              <input type="hidden" name="token" value={params.token} />
              <button type="submit" className="btn-primary w-full">
                Leave the waitlist
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
