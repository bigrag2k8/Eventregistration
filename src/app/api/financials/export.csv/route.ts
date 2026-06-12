import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRoleApi, orgScope } from "@/lib/auth";
import { resolveRange } from "@/lib/finance-range";

/** Org-wide transaction export for bookkeeping. Honors the same ?range/?from/?to window as the page. */
export async function GET(req: Request) {
  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;
  const url = new URL(req.url);
  const range = resolveRange(
    {
      range: url.searchParams.get("range") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    Date.now(),
  );
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (range.from) createdAt.gte = range.from;
  if (range.to) createdAt.lt = range.to;

  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      registration: { event: { ...orgScope(session), deletedAt: null } },
      ...(range.from || range.to ? { createdAt } : {}),
    },
    include: {
      registration: {
        include: {
          event: { select: { name: true } },
          ticketType: { select: { name: true, isVendorTier: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Date", "Event", "Kind", "Ticket Type", "Attendee", "Email", "Company",
    "Gross", "Refunded", "Net", "Platform Fee", "Currency", "Status",
  ];
  const rows = payments.map((p) => {
    const r = p.registration;
    const net = p.amountCents - p.refundedAmountCents;
    return [
      p.createdAt.toISOString(),
      r?.event?.name ?? "",
      r?.ticketType?.isVendorTier ? "vendor" : "ticket",
      r?.ticketType?.name ?? "",
      `${r?.firstName ?? ""} ${r?.lastName ?? ""}`.trim(),
      r?.email ?? "",
      r?.company ?? "",
      (p.amountCents / 100).toFixed(2),
      (p.refundedAmountCents / 100).toFixed(2),
      (net / 100).toFixed(2),
      (p.platformFeeCents / 100).toFixed(2),
      p.currency,
      p.status,
    ];
  });

  // Quote-escape AND neutralize spreadsheet formula injection on user-controlled fields.
  const cell = (c: unknown) => {
    let s = String(c).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financials-${range.preset}.csv"`,
    },
  });
}
