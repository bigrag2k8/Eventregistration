import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { RefundRequestForm } from "./RefundRequestForm";

export const dynamic = "force-dynamic";

interface Props {
  params: { orgSlug: string; slug: string };
  searchParams: { reg?: string; key?: string };
}

export default async function RefundRequestPage({ params, searchParams }: Props) {
  if (!searchParams.reg || !searchParams.key) return notFound();

  const reg = await prisma.registration.findUnique({
    where: { id: searchParams.reg },
    include: {
      event: { include: { organization: true } },
      ticketType: true,
      refundRequests: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!reg) return notFound();
  if (reg.event.organization.slug !== params.orgSlug) return notFound();
  if (!reg.accessToken || reg.accessToken !== searchParams.key) return notFound();

  const openRequest = reg.refundRequests.find((r) => r.status === "OPEN");
  const pastRequests = reg.refundRequests.filter((r) => r.status !== "OPEN");

  const canRequest =
    reg.status === "CONFIRMED" &&
    reg.totalCents > 0 &&
    !openRequest;

  // If the ORGANIZER rescheduled the event after this person registered, the
  // approved refund is FULL (platform fee included) — the date change wasn't
  // the attendee's doing. Matches approveRefundRequestAction's policy and the
  // reschedule email's "request a full refund" promise.
  const rescheduleCaused =
    !!reg.event.rescheduledAt && reg.createdAt < reg.event.rescheduledAt;
  const feeCents = rescheduleCaused ? 0 : Math.ceil(reg.totalCents * 0.05);
  const refundEstimate = reg.totalCents - feeCents;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="card">
        <Link href={`/o/${params.orgSlug}/events/${reg.event.slug}`} className="text-sm text-brand-700">
          &larr; Back to event
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Request a refund</h1>
        <p className="mt-1 text-sm text-slate-600">
          {reg.event.name} &middot; {reg.ticketType.name}
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
          <div className="flex justify-between">
            <span>Registrant</span>
            <span className="font-medium">{reg.firstName} {reg.lastName}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Total paid</span>
            <span className="font-medium">{money(reg.totalCents, reg.currency)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>
              {rescheduleCaused
                ? "Refund if approved (full — this event was rescheduled)"
                : "Estimated refund (minus 5% processing fee)"}
            </span>
            <span className="font-medium">{money(refundEstimate, reg.currency)}</span>
          </div>
        </div>

        {reg.event.refundPolicy && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Refund policy:</strong> {reg.event.refundPolicy}
          </div>
        )}

        {openRequest && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <strong>Refund request pending</strong>
            <p className="mt-1">
              You submitted a refund request on{" "}
              {new Date(openRequest.createdAt).toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric",
              })}
              . The organizer will review it and you'll receive an email with the outcome.
            </p>
            <p className="mt-2 text-xs text-blue-600">
              Reason: {openRequest.reason}
            </p>
          </div>
        )}

        {reg.status !== "CONFIRMED" && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            This registration is <strong>{reg.status.toLowerCase()}</strong> and is not eligible for a refund request.
          </div>
        )}

        {reg.totalCents === 0 && reg.status === "CONFIRMED" && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            This is a free registration and does not require a refund.
          </div>
        )}

        {canRequest && (
          <RefundRequestForm registrationId={reg.id} accessKey={searchParams.key} />
        )}

        {pastRequests.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-700">Previous requests</h3>
            <div className="mt-2 space-y-2">
              {pastRequests.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                      : r.status === "DENIED" ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-600"
                    }`}>{r.status}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.reviewNote && (
                    <p className="mt-1 text-xs text-slate-600">
                      Organizer note: {r.reviewNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
