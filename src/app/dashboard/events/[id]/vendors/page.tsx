import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { money } from "@/lib/format";
import { approveVendorAction, rejectVendorAction, deleteVendorApplicationAction, refundVendorAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING:    "bg-amber-100 text-amber-700",
  APPROVED:   "bg-emerald-100 text-emerald-700",
  PAID:       "bg-brand-100 text-brand-700",
  REFUNDED:   "bg-purple-100 text-purple-700",
  REJECTED:   "bg-red-100 text-red-700",
  WITHDRAWN:  "bg-slate-100 text-slate-600",
};

export default async function VendorsPage({ params, searchParams }: {
  params: { id: string }; searchParams: { status?: string; error?: string };
}) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const filter = searchParams.status;
  const apps = await prisma.vendorApplication.findMany({
    where: {
      eventId: event.id,
      ...(filter && filter !== "ALL" ? { status: filter as any } : {}),
    },
    include: { ticketType: true },
    orderBy: { submittedAt: "desc" },
  });

  const counts = await prisma.vendorApplication.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((a, b) => a + b._count, 0);

  // Refund amount + date for refunded vendors comes from the linked registration's payment.
  const regIds = apps.map((a) => a.registrationId).filter(Boolean) as string[];
  const payments = regIds.length
    ? await prisma.payment.findMany({
        where: { registrationId: { in: regIds } },
        select: { registrationId: true, refundedAmountCents: true, updatedAt: true },
      })
    : [];
  const payByReg = new Map(payments.map((p) => [p.registrationId, p]));

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">◀ Event</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Vendors</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/events/${event.slug}/vendors`} target="_blank" className="btn-secondary">View public form ↗</Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <ErrorBanner code={searchParams?.error} />
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 text-sm">
          {["ALL", "PENDING", "APPROVED", "PAID", "REFUNDED", "REJECTED", "WITHDRAWN"].map((s) => {
            const active = (filter ?? "ALL") === s;
            const count = s === "ALL" ? total : (countMap[s] ?? 0);
            return (
              <Link
                key={s}
                href={`/dashboard/events/${event.id}/vendors${s === "ALL" ? "" : `?status=${s}`}`}
                className={`rounded-full px-3 py-1 ring-1 ${active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
              >
                {s} ({count})
              </Link>
            );
          })}
        </div>

        <div className="space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{a.companyName}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {a.contactFirstName} {a.contactLastName} · {a.email}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </div>
                  {a.website && (
                    <div className="text-sm">
                      <a href={a.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                        {a.website} ↗
                      </a>
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  Submitted {a.submittedAt.toLocaleDateString()}<br />
                  {a.quotedPriceCents !== null && a.quotedPriceCents !== undefined && (
                    <>Quoted: <strong>${(a.quotedPriceCents/100).toFixed(2)}</strong></>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <div className="font-medium text-slate-700">Description</div>
                  <p className="mt-1 whitespace-pre-line text-slate-600">{a.description}</p>
                </div>
                <div className="space-y-1 text-slate-600">
                  {a.productCategory && <div><strong>Category:</strong> {a.productCategory}</div>}
                  {a.boothPreference && <div><strong>Booth preference:</strong> {a.boothPreference}</div>}
                  {a.sponsorshipLevel && <div><strong>Sponsorship interest:</strong> {a.sponsorshipLevel}</div>}
                  <div><strong>Electrical:</strong> {a.electricalNeeds ? "Yes" : "No"}</div>
                  {a.additionalRequests && <div><strong>Other requests:</strong> {a.additionalRequests}</div>}
                </div>
              </div>

              {(a.approvalNotes || a.rejectionReason) && (
                <div className={`mt-4 rounded-lg p-3 text-sm ring-1 ${a.status === "REJECTED" ? "bg-red-50 ring-red-200 text-red-800" : "bg-brand-50 ring-brand-200 text-brand-800"}`}>
                  <strong>{a.status === "REJECTED" ? "Reason given:" : "Notes sent to vendor:"}</strong>{" "}
                  {a.approvalNotes || a.rejectionReason}
                </div>
              )}

              {a.status === "PENDING" && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
                  <form action={approveVendorAction} className="flex flex-1 flex-wrap items-end gap-2 min-w-[280px]">
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <div className="w-28">
                      <label className="label">Price ($)</label>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={(event.defaultVendorPriceCents / 100).toFixed(2)}
                        className="input"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="label">Notes (optional, sent in approval email)</label>
                      <input name="notes" className="input" placeholder="e.g. Booth #14 reserved, load-in 8am" />
                    </div>
                    <button type="submit" className="btn-primary whitespace-nowrap">✓ Approve</button>
                  </form>
                  <form action={rejectVendorAction} className="flex flex-1 items-end gap-2 min-w-[280px]">
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="appId" value={a.id} />
                    <div className="flex-1">
                      <label className="label">Reason (optional, sent in rejection email)</label>
                      <input name="reason" className="input" placeholder="e.g. Category not a fit this year" />
                    </div>
                    <ConfirmButton
                      label="✕ Reject"
                      confirmText={`Reject ${a.companyName}? They will receive an email with your reason.`}
                      className="btn-secondary whitespace-nowrap text-red-700 hover:bg-red-50"
                    />
                  </form>
                </div>
              )}

              {a.status !== "PENDING" && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="text-xs">
                    {a.status === "REFUNDED" && (() => {
                      const refund = a.registrationId ? payByReg.get(a.registrationId) : null;
                      return (
                        <span className="text-purple-700">
                          ↩ Refunded{refund ? ` ${money(refund.refundedAmountCents, "USD")}` : ""}
                          {refund ? ` · ${refund.updatedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : ""}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3">
                    {a.status === "PAID" && (
                      <details className="relative inline-block">
                        <summary className="cursor-pointer list-none text-xs text-brand-700 hover:underline [&::-webkit-details-marker]:hidden">Refund vendor ▾</summary>
                        <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                          <form action={refundVendorAction}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="appId" value={a.id} />
                            <input type="hidden" name="mode" value="net" />
                            <ConfirmButton
                              label="Refund minus 4.5% fee"
                              confirmText={`Refund ${a.companyName} their booth payment minus the non-refundable 4.5% processing fee? Use this for a vendor-requested cancellation. Their vendor pass is invalidated.`}
                              className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                            />
                          </form>
                          <form action={refundVendorAction}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="appId" value={a.id} />
                            <input type="hidden" name="mode" value="full" />
                            <ConfirmButton
                              label="Full refund (incl. fee)"
                              confirmText={`Refund ${a.companyName}'s FULL booth payment of $${((a.quotedPriceCents ?? 0) / 100).toFixed(2)}, including the 4.5% processing fee? Use this when you cancel the event. Their vendor pass is invalidated.`}
                              className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                            />
                          </form>
                        </div>
                      </details>
                    )}
                    <form action={deleteVendorApplicationAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="appId" value={a.id} />
                      <ConfirmButton
                        label="Delete application"
                        confirmText={`Permanently delete ${a.companyName}'s application?`}
                        className="text-xs text-red-600 hover:underline"
                      />
                    </form>
                  </div>
                </div>
              )}
            </div>
          ))}

          {apps.length === 0 && (
            <div className="card text-center text-slate-500">
              No vendor applications {filter && filter !== "ALL" ? `with status ${filter}` : "yet"}.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
