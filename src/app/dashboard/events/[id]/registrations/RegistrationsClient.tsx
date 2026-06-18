"use client";

import { Fragment, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";

interface RegRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  ticketName: string;
  quantity: number;
  totalCents: number;
  currency: string;
  status: string;
  checkedCount: number;
  ticketCount: number;
  earliestCheckIn: string | null;
  createdAt: string;
  refundedAmountCents: number | null;
  refundedAt: string | null;
  qrTokens: Array<{ id: string; token: string; checkedIn: boolean }>;
  isRefundable: boolean;
}

interface Props {
  eventId: string;
  isSuperAdmin: boolean;
  regs: RegRow[];
  cancelAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  refundAction: (fd: FormData) => Promise<void>;
  bulkRefundAction: (fd: FormData) => Promise<void>;
  reissueAction: (fd: FormData) => Promise<void>;
}

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function RegistrationsClient({
  eventId, isSuperAdmin, regs, cancelAction, deleteAction, refundAction, bulkRefundAction, reissueAction,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const refundableIds = regs.filter((r) => r.isRefundable).map((r) => r.id);
  const allSelected = refundableIds.length > 0 && refundableIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(refundableIds));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkRefund(mode: string) {
    if (selected.size === 0) return;
    const names = Array.from(selected)
      .map((id) => {
        const r = regs.find((x) => x.id === id);
        return r ? `${r.firstName} ${r.lastName}` : "Unknown";
      })
      .slice(0, 15);
    const more = selected.size > 15 ? `\n  ...and ${selected.size - 15} more` : "";
    const feeNote = mode === "full"
      ? "in FULL (100%), including the 4.5% processing fee"
      : "minus the non-refundable 4.5% processing fee";
    const msg = `Refund ${selected.size} registration(s) ${feeNote}?\n\n  - ${names.join("\n  - ")}${more}`;
    if (!confirm(msg)) return;

    const fd = new FormData();
    fd.set("eventId", eventId);
    fd.set("registrationIds", Array.from(selected).join(","));
    fd.set("mode", mode);
    startTransition(() => {
      bulkRefundAction(fd).then(() => setSelected(new Set()));
    });
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium text-brand-800">
            {selected.size} registration{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => handleBulkRefund("net")}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Processing..." : "Refund selected (minus 4.5%)"}
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleBulkRefund("full")}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {pending ? "Processing..." : "Full refund selected (100%)"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-600 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 w-8">
                {refundableIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                )}
              </th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Ticket</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Checked in</th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {regs.map((r) => (
              <Fragment key={r.id}>
                <tr className={selected.has(r.id) ? "bg-brand-50/50" : ""}>
                  <td className="px-3 py-2">
                    {r.isRefundable && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.firstName} {r.lastName}</td>
                  <td className="px-3 py-2 text-slate-600">{r.email}</td>
                  <td className="px-3 py-2 text-slate-600">{r.company ?? ""}</td>
                  <td className="px-3 py-2">{r.ticketName}</td>
                  <td className="px-3 py-2 text-right">{r.quantity}</td>
                  <td className="px-3 py-2 text-right">{money(r.totalCents, r.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700"
                      : r.status === "PENDING" ? "bg-amber-100 text-amber-700"
                      : r.status === "REFUNDED" ? "bg-purple-100 text-purple-700"
                      : r.status === "PARTIALLY_REFUNDED" ? "bg-purple-100 text-purple-700"
                      : "bg-slate-100 text-slate-600"
                    }`}>{r.status === "PARTIALLY_REFUNDED" ? "PART. REFUNDED" : r.status}</span>
                    {(r.status === "REFUNDED" || r.status === "PARTIALLY_REFUNDED") && r.refundedAmountCents !== null && (
                      <div className="mt-1 text-[11px] text-purple-700">
                        ↩ Refunded {money(r.refundedAmountCents, r.currency)}
                        {r.refundedAt && ` · ${r.refundedAt}`}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.checkedCount}/{r.ticketCount || r.quantity}</div>
                    {r.earliestCheckIn && (
                      <div className="text-xs text-slate-500">{r.earliestCheckIn}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.createdAt}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {r.isRefundable && isSuperAdmin && (
                        <details className="relative inline-block">
                          <summary className="cursor-pointer list-none text-xs text-brand-700 hover:underline [&::-webkit-details-marker]:hidden">Refund ▾</summary>
                          <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                            <form action={refundAction}>
                              <input type="hidden" name="eventId" value={eventId} />
                              <input type="hidden" name="registrationId" value={r.id} />
                              <input type="hidden" name="mode" value="net" />
                              <ConfirmButton
                                label="Refund minus 4.5% fee"
                                confirmText={`Refund ${r.firstName} ${r.lastName} the ticket price minus the 4.5% processing fee ($${((r.totalCents * 0.045) / 100).toFixed(2)})?`}
                                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                              />
                            </form>
                            <form action={refundAction}>
                              <input type="hidden" name="eventId" value={eventId} />
                              <input type="hidden" name="registrationId" value={r.id} />
                              <input type="hidden" name="mode" value="full" />
                              <ConfirmButton
                                label="Full refund (100%)"
                                confirmText={`Refund the FULL $${(r.totalCents / 100).toFixed(2)} to ${r.firstName} ${r.lastName}, including the 4.5% processing fee?`}
                                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                              />
                            </form>
                          </div>
                        </details>
                      )}
                      {r.isRefundable && !isSuperAdmin && (
                        <form action={refundAction} className="inline">
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="registrationId" value={r.id} />
                          <input type="hidden" name="mode" value="net" />
                          <ConfirmButton
                            label="Refund"
                            confirmText={`Refund ${r.firstName} ${r.lastName} the ticket price minus the non-refundable 4.5% processing fee ($${((r.totalCents * 0.045) / 100).toFixed(2)})?`}
                            className="text-xs text-brand-700 hover:underline"
                          />
                        </form>
                      )}
                      {r.status === "CONFIRMED" && (
                        <form action={reissueAction} className="inline">
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="registrationId" value={r.id} />
                          <ConfirmButton
                            label="Reissue"
                            confirmText={`Regenerate the QR ticket${(r.ticketCount || r.quantity) > 1 ? "s" : ""} for ${r.firstName} ${r.lastName} and email a fresh copy to ${r.email}? Any previously issued QR codes will stop working.`}
                            className="text-xs text-slate-600 hover:underline"
                          />
                        </form>
                      )}
                      {r.status !== "CANCELLED" && (
                        <form action={cancelAction} className="inline">
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="registrationId" value={r.id} />
                          <ConfirmButton
                            label="Cancel"
                            confirmText={`Cancel registration for ${r.firstName} ${r.lastName}? Tickets will be invalidated and the seat opens back up.`}
                            className="text-xs text-amber-600 hover:underline"
                          />
                        </form>
                      )}
                      <form action={deleteAction} className="inline">
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="registrationId" value={r.id} />
                        <ConfirmButton
                          label="Delete"
                          confirmText={`PERMANENTLY delete registration for ${r.firstName} ${r.lastName}? This cannot be undone.`}
                          className="text-xs text-red-600 hover:underline"
                        />
                      </form>
                    </div>
                  </td>
                </tr>
                {r.qrTokens.length > 0 && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={11} className="px-3 py-2">
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-500">
                          Show {r.qrTokens.length} QR token{r.qrTokens.length > 1 ? "s" : ""} (for manual check-in entry)
                        </summary>
                        <div className="mt-2 space-y-2">
                          {r.qrTokens.map((t, i) => (
                            <div key={t.id} className="flex items-start gap-2">
                              <span className="text-xs text-slate-500 whitespace-nowrap pt-2">#{i + 1}{t.checkedIn ? " ✓" : ""}</span>
                              <textarea
                                readOnly
                                rows={2}
                                className="grow rounded border border-slate-200 bg-white p-2 font-mono text-[10px] break-all"
                                defaultValue={t.token}
                              />
                              <CopyButton text={t.token} />
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {regs.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-12 text-center text-slate-500">No registrations match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
