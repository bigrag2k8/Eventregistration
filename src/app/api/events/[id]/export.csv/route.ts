import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

/**
 * Quote-escape AND neutralize CSV formula injection: a field starting with
 * = + - @ (or tab/CR) executes as a formula when opened in Excel/Sheets, so
 * prefix those with ' to force text.
 */
function toCsv(headers: string[], rows: unknown[][]) {
  const cell = (c: unknown) => {
    let s = String(c ?? "").replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  const event = await prisma.event.findUnique({ where: { id: params.id }, include: { customQuestions: true } });
  if (!event || event.organizationId !== session.orgId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const type = new URL(req.url).searchParams.get("type") === "vendors" ? "vendors" : "registrations";

  let headers: string[];
  let rows: unknown[][];

  if (type === "vendors") {
    const apps = await prisma.vendorApplication.findMany({
      where: { eventId: event.id },
      orderBy: { submittedAt: "desc" },
    });
    headers = [
      "Company", "Contact First Name", "Contact Last Name", "Email", "Phone", "Website",
      "Street Address", "Address Line 2", "City", "State", "ZIP Code", "Country",
      "Product Category", "Booth Preference", "Sponsorship Level", "Status",
      "Submitted At", "Paid At", "Quoted Price",
    ];
    rows = apps.map((v) => [
      v.companyName, v.contactFirstName, v.contactLastName, v.email, v.phone ?? "", v.website ?? "",
      v.addressLine1 ?? "", v.addressLine2 ?? "", v.city ?? "", v.state ?? "", v.zipCode ?? "", v.country ?? "",
      v.productCategory ?? "", v.boothPreference ?? "", v.sponsorshipLevel ?? "", v.status,
      v.submittedAt.toISOString(), v.paidAt?.toISOString() ?? "",
      v.quotedPriceCents != null ? (v.quotedPriceCents / 100).toFixed(2) : "",
    ]);
  } else {
    const regs = await prisma.registration.findMany({
      where: { eventId: event.id, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
      include: { ticketType: true, tickets: { include: { checkIn: true } }, answers: true },
    });
    headers = [
      "Company", "First Name", "Last Name", "Email", "Phone", "Job Title",
      "Street Address", "Address Line 2", "City", "State", "ZIP Code", "Country",
      "Ticket Type", "Quantity", "Total", "Status", "Confirmed At", "Checked In", "Checked In At",
      "Registration ID",
      ...event.customQuestions.map((q) => q.label),
    ];
    rows = regs.map((r) => {
      const checkedTickets = r.tickets.filter((t) => t.checkIn);
      const allChecked = r.tickets.length > 0 && checkedTickets.length === r.tickets.length;
      const firstCheckIn = checkedTickets
        .map((t) => t.checkIn!.scannedAt)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const answerMap = new Map(r.answers.map((a) => [a.questionId, a.answer]));
      return [
        r.company ?? "", r.firstName, r.lastName, r.email, r.phone ?? "", r.jobTitle ?? "",
        r.addressLine1 ?? "", r.addressLine2 ?? "", r.city ?? "", r.state ?? "", r.zipCode ?? "", r.country ?? "",
        r.ticketType.name, String(r.quantity), (r.totalCents / 100).toFixed(2), r.status,
        r.confirmedAt?.toISOString() ?? "",
        allChecked ? "yes" : checkedTickets.length > 0 ? `partial (${checkedTickets.length}/${r.tickets.length})` : "no",
        firstCheckIn?.toISOString() ?? "",
        r.id,
        ...event.customQuestions.map((q) => answerMap.get(q.id) ?? ""),
      ];
    });
  }

  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-${type}.csv"`,
    },
  });
}
