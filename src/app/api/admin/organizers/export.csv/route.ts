import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const PLAN_KEYS = ["FREE", "SINGLE_EVENT", "STARTER", "PRO", "ENTERPRISE"] as const;
const STATUS_KEYS = ["NONE", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE"] as const;

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
    plan: url.searchParams.get("plan") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    connect: url.searchParams.get("connect") ?? undefined,
  };

  const where: Prisma.OrganizationWhereInput = { deletedAt: null };
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.plan && (PLAN_KEYS as readonly string[]).includes(sp.plan)) {
    where.subscriptionPlan = sp.plan as (typeof PLAN_KEYS)[number];
  }
  if (sp.status && (STATUS_KEYS as readonly string[]).includes(sp.status)) {
    where.subscriptionStatus = sp.status as (typeof STATUS_KEYS)[number];
  }
  if (sp.connect === "enabled") where.stripeAccountChargesEnabled = true;
  else if (sp.connect === "disabled") {
    where.AND = [
      { stripeAccountId: { not: null } },
      { stripeAccountChargesEnabled: false },
    ];
  } else if (sp.connect === "none") where.stripeAccountId = null;

  const orgs = await prisma.organization.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { events: true, members: true } } },
  });

  const headers = [
    "Organization Name",
    "Slug",
    "Contact Email",
    "Contact Phone",
    "Website",
    "Plan",
    "Subscription Status",
    "Single-Event Credits",
    "Stripe Account ID",
    "Charges Enabled",
    "Payouts Enabled",
    "Onboarding Complete",
    "Connect Status",
    "Members",
    "Events",
    "Pass Processing Fee",
    "Created At",
  ];
  const rows = orgs.map((o) => [
    o.name,
    o.slug,
    o.contactEmail ?? "",
    o.contactPhone ?? "",
    o.website ?? "",
    o.subscriptionPlan,
    o.subscriptionStatus,
    String(o.singleEventCredits),
    o.stripeAccountId ?? "",
    o.stripeAccountChargesEnabled ? "yes" : "no",
    o.stripeAccountPayoutsEnabled ? "yes" : "no",
    o.stripeAccountDetailsSubmitted ? "yes" : "no",
    o.stripeAccountStatus ?? "",
    String(o._count.members),
    String(o._count.events),
    o.passProcessingFee ? "yes" : "no",
    o.createdAt.toISOString(),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="organizers-${stamp}.csv"`,
    },
  });
}
