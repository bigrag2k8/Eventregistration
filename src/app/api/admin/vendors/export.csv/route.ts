import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_KEYS = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAID",
  "REFUNDED",
  "WITHDRAWN",
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
    productCategory: url.searchParams.get("productCategory") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const where: Prisma.VendorApplicationWhereInput = {};
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contactFirstName: { contains: q, mode: "insensitive" } },
      { contactLastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.orgId) where.event = { organizationId: sp.orgId };
  if (sp.eventId) where.eventId = sp.eventId;
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.status = sp.status as (typeof STATUS_KEYS)[number];
  }
  if (sp.productCategory) where.productCategory = sp.productCategory;
  if (sp.from && DATE_RE.test(sp.from)) {
    where.submittedAt = { ...(where.submittedAt as object), gte: new Date(sp.from) };
  }
  if (sp.to && DATE_RE.test(sp.to)) {
    const end = new Date(sp.to);
    end.setUTCDate(end.getUTCDate() + 1);
    where.submittedAt = { ...(where.submittedAt as object), lt: end };
  }

  const vendors = await prisma.vendorApplication.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    include: {
      event: {
        select: {
          name: true,
          slug: true,
          startAt: true,
          organization: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const headers = [
    "Organization",
    "Org Slug",
    "Event",
    "Event Slug",
    "Event Start (UTC)",
    "Company Name",
    "Contact First Name",
    "Contact Last Name",
    "Email",
    "Phone",
    "Website",
    "Street Address",
    "Address Line 2",
    "City",
    "State",
    "ZIP Code",
    "Country",
    "Product Category",
    "Booth Preference",
    "Sponsorship Level",
    "Electrical Needs",
    "Description",
    "Additional Requests",
    "Status",
    "Quoted Price",
    "Submitted At (UTC)",
    "Reviewed At (UTC)",
    "Paid At (UTC)",
    "Rejection Reason",
    "Approval Notes",
    "Vendor ID",
  ];
  const rows = vendors.map((v) => [
    v.event.organization.name,
    v.event.organization.slug,
    v.event.name,
    v.event.slug,
    v.event.startAt.toISOString(),
    v.companyName,
    v.contactFirstName,
    v.contactLastName,
    v.email,
    v.phone ?? "",
    v.website ?? "",
    v.addressLine1 ?? "",
    v.addressLine2 ?? "",
    v.city ?? "",
    v.state ?? "",
    v.zipCode ?? "",
    v.country ?? "",
    v.productCategory ?? "",
    v.boothPreference ?? "",
    v.sponsorshipLevel ?? "",
    v.electricalNeeds ? "yes" : "no",
    v.description,
    v.additionalRequests ?? "",
    v.status,
    v.quotedPriceCents != null ? (v.quotedPriceCents / 100).toFixed(2) : "",
    v.submittedAt.toISOString(),
    v.reviewedAt?.toISOString() ?? "",
    v.paidAt?.toISOString() ?? "",
    v.rejectionReason ?? "",
    v.approvalNotes ?? "",
    v.id,
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendors-${stamp}.csv"`,
    },
  });
}
