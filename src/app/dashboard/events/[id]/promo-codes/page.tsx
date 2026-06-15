import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { money } from "@/lib/format";
import { SignOutButton } from "@/components/SignOutButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createPromoCodeAction, togglePromoCodeAction, deletePromoCodeAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  validation: "Please fill in the form correctly.",
  bad_code: "Codes can use letters, numbers, dashes and underscores only.",
  bad_value: "Enter a discount value greater than zero.",
  bad_percent: "A percentage must be between 1 and 100.",
  dupe_code: "A code with that name already exists for this event.",
  in_use: "That code has already been redeemed — deactivate it instead of deleting.",
  not_found: "That promo code no longer exists.",
};

interface Props {
  params: { id: string };
  searchParams: { error?: string };
}

export default async function PromoCodesPage({ params, searchParams }: Props) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: params.id, ...orgScope(session), deletedAt: null },
  });
  if (!event) return notFound();

  const codes = await prisma.promoCode.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
  });

  const err = searchParams.error ? ERRORS[searchParams.error] ?? "Something went wrong." : null;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="text-sm text-brand-700">&laquo; Event</Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">{event.name} — Promo Codes</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {err && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{err}</div>
        )}

        {/* Create form */}
        <form action={createPromoCodeAction} className="card space-y-4">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-lg font-semibold">Create a promo code</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Code *</label>
              <input name="code" required placeholder="e.g. SPONSOR20" className="input uppercase" />
              <p className="mt-1 text-xs text-slate-400">Shared with the people you want to give the discount to.</p>
            </div>
            <div>
              <label className="label">Discount type *</label>
              <select name="discountType" className="input" defaultValue="PERCENTAGE">
                <option value="PERCENTAGE">Percentage off</option>
                <option value="FIXED">Fixed amount off</option>
              </select>
            </div>
            <div>
              <label className="label">Value *</label>
              <input name="value" required type="number" step="0.01" min="0" placeholder="e.g. 20" className="input" />
              <p className="mt-1 text-xs text-slate-400">A number — 20 means 20% or $20 depending on the type.</p>
            </div>
            <div>
              <label className="label">Usage limit</label>
              <input name="usageLimit" type="number" min="1" placeholder="Unlimited" className="input" />
              <p className="mt-1 text-xs text-slate-400">Max number of times this code can be used.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Expires</label>
              <input name="expiresAt" type="datetime-local" className="input max-w-xs" />
              <p className="mt-1 text-xs text-slate-400">Optional. Interpreted in the event's timezone ({event.timezone}).</p>
            </div>
          </div>
          <button type="submit" className="btn-primary">Create code</button>
          <p className="text-xs text-slate-500">
            Promo codes apply on top of any early-bird discount and are entered by the attendee at checkout.
          </p>
        </form>

        {/* Existing codes */}
        {codes.length === 0 ? (
          <div className="card py-10 text-center text-slate-500">No promo codes yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {codes.map((c) => {
                  const expired = c.expiresAt ? c.expiresAt < new Date() : false;
                  const discount = c.discountType === "PERCENTAGE"
                    ? `${Number(c.percentage ?? 0)}% off`
                    : `${money(c.amountCents ?? 0, "USD")} off`;
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-mono font-medium">{c.code}</td>
                      <td className="px-3 py-2">{discount}</td>
                      <td className="px-3 py-2">{c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {c.expiresAt ? formatInTimeZone(c.expiresAt, event.timezone, "MMM d, yyyy h:mm a") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          expired ? "bg-slate-100 text-slate-500"
                          : c.isActive ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                        }`}>
                          {expired ? "EXPIRED" : c.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <form action={togglePromoCodeAction} className="inline">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="promoCodeId" value={c.id} />
                            <button type="submit" className="text-xs text-brand-700 hover:underline">
                              {c.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                          {c.usageCount === 0 && (
                            <form action={deletePromoCodeAction} className="inline">
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="promoCodeId" value={c.id} />
                              <ConfirmButton
                                label="Delete"
                                confirmText={`Delete promo code ${c.code}? This can't be undone.`}
                                className="text-xs text-red-600 hover:underline"
                              />
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
