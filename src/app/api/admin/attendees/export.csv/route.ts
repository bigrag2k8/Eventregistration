import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_KEYS = [
  "CONFIRMED",
  "PENDING",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

function toCsv(headers: string[], rows: unknown[][]) {
  const cell = (c: unknown) => {
    let s = String(c ?? "").replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (session.role !== "SUPERADMIN") return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const sp = {
    q: url.searchParams.get("q") ?? undefined,
    orgId: url.searchParams.get("orgId") ?? undefined,
    eventId: url.searchParams.get("eventId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const where: Prisma.RegistrationWhereInput = { deletedAt: null };
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.orgId) where.event = { organizationId: sp.orgId };
  if (sp.eventId) where.eventId = sp.eventId;
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.status = sp.status as (typeof STATUS_KEYS)[number];
  } else if (!sp.status) {
    where.status = { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] };
  }
  if (sp.from && DATE_RE.test(sp.from)) {
    where.createdAt = { ...(where.createdAt as object), gte: new Date(sp.from) };
  }
  if (sp.to && DATE_RE.test(sp.to)) {
    const end = new Date(sp.to);
    end.setUTCDate(end.getUTCDate() + 1);
    where.createdAt = { ...(where.createdAt as object), lt: end };
  }

  const regs = await prisma.registration.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      event: {
        select: {
          name: true,
          slug: true,
          startAt: true,
          organization: { select: { name: true, slug: true } },
        },
      },
      ticketType: { select: { name: true } },
      tickets: { select: { id: true, checkIn: { select: { scannedAt: true } } } },
    },
  });

  const headers = [
    "Organization",
    "Org Slug",
    "Event",
    "Event Slug",
    "Event Start (UTC)",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Company",
    "Job Title",
    "Dietary",
    "Accessibility",
    "Special Requests",
    "Street Address",
    "Address Line 2",
    "City",
    "State",
    "ZIP Code",
    "Country",
    "Ticket Type",
    "Quantity",
    "Subtotal",
    "Discount",
    "Tax",
    "Fee",
    "Total",
    "Currency",
    "Status",
    "Confirmed At (UTC)",
    "Cancelled At (UTC)",
    "Cancel Reason",
    "Checked In",
    "First Check-in At (UTC)",
    "Created At (UTC)",
    "Registration ID",
  ];
  const rows = regs.map((r) => {
    const checked = r.tickets.filter((t) => t.checkIn);
    const allChecked = r.tickets.length > 0 && checked.length === r.tickets.length;
    const firstCheck = checked
      .map((t) => t.checkIn!.scannedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return [
      r.event.organization.name,
      r.event.organization.slug,
      r.event.name,
      r.event.slug,
      r.event.startAt.toISOString(),
      r.firstName,
      r.lastName,
      r.email,
      r.phone ?? "",
      r.company ?? "",
      r.jobTitle ?? "",
      r.dietary ?? "",
      r.accessibility ?? "",
      r.specialRequests ?? "",
      r.addressLine1 ?? "",
      r.addressLine2 ?? "",
      r.city ?? "",
      r.state ?? "",
      r.zipCode ?? "",
      r.country ?? "",
      r.ticketType.name,
      String(r.quantity),
      (r.subtotalCents / 100).toFixed(2),
      (r.discountCents / 100).toFixed(2),
      (r.taxCents / 100).toFixed(2),
      (r.feeCents / 100).toFixed(2),
      (r.totalCents / 100).toFixed(2),
      r.currency,
      r.status,
      r.confirmedAt?.toISOString() ?? "",
      r.cancelledAt?.toISOString() ?? "",
      r.cancelReason ?? "",
      allChecked ? "yes" : checked.length > 0 ? `partial (${checked.length}/${r.tickets.length})` : "no",
      firstCheck?.toISOString() ?? "",
      r.createdAt.toISOString(),
      r.id,
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendees-${stamp}.csv"`,
    },
  });
}
