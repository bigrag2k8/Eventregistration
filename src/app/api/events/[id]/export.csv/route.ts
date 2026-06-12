import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  const event = await prisma.event.findUnique({ where: { id: params.id }, include: { customQuestions: true } });
  if (!event || event.organizationId !== session.orgId) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const regs = await prisma.registration.findMany({
    where: { eventId: event.id, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
    include: { ticketType: true, tickets: { include: { checkIn: true } }, answers: true },
  });

  const headers = [
    "Registration ID", "First Name", "Last Name", "Email", "Phone", "Company", "Job Title",
    "Ticket Type", "Quantity", "Total", "Status", "Confirmed At", "Checked In", "Checked In At",
    ...event.customQuestions.map((q) => q.label),
  ];
  const rows = regs.map((r) => {
    const checkedTickets = r.tickets.filter((t) => t.checkIn);
    const allChecked = r.tickets.length > 0 && checkedTickets.length === r.tickets.length;
    const firstCheckIn = checkedTickets
      .map((t) => t.checkIn!.scannedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const answerMap = new Map(r.answers.map((a) => [a.questionId, a.answer]));
    return [
      r.id, r.firstName, r.lastName, r.email, r.phone ?? "", r.company ?? "", r.jobTitle ?? "",
      r.ticketType.name, String(r.quantity), (r.totalCents / 100).toFixed(2), r.status,
      r.confirmedAt?.toISOString() ?? "",
      allChecked ? "yes" : checkedTickets.length > 0 ? `partial (${checkedTickets.length}/${r.tickets.length})` : "no",
      firstCheckIn?.toISOString() ?? "",
      ...event.customQuestions.map((q) => answerMap.get(q.id) ?? ""),
    ];
  });

  // Quote-escape AND neutralize formula injection: attendee-controlled fields
  // starting with = + - @ (or tab/CR) execute as formulas when the organizer
  // opens the export in Excel. Prefix with ' so they render as text.
  const cell = (c: unknown) => {
    let s = String(c).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
    },
  });
}
